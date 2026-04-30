-- =============================================
-- 11_phase8.sql — Phase 8 (Maintenance Requests + Tasks)
-- =============================================
-- يطبَّق بعد 10_phase7.sql.
-- يضيف workflow integrity كامل لـ maintenance_requests + tasks، وستمل
-- جميع دروس Codex من المراحل 6/7:
--   1) INSERT lock (status=initial، حقول workflow=NULL)
--   2) BEFORE UPDATE trigger كامل (لا OF status فقط)
--   3) Transition whitelist
--   4) Per-transition field whitelist
--   5) Storage: maintenance bucket orphan-only DELETE
--   6) Technician restrictions (الفني يحدّث فقط after_image + status)
-- =============================================

-- =============================================
-- (0) Private schema — context tables for unforgeable enforcement
-- =============================================
-- Codex round 3 P1: GUC flags (set_config) قابلة للتزوير من العميل
-- (أي مستخدم بصلاحية UPDATE يستطيع set_config('app.linking_expense','true')
-- ويتجاوز الـ RPC). الحل: جدول في schema خاصة لا يملك authenticated
-- صلاحية الكتابة عليه. الـ trigger يكون SECURITY DEFINER ويقرأ منها.
-- =============================================

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from authenticated;
revoke all on schema private from anon;

drop table if exists private.linking_in_progress;
create table private.linking_in_progress (
  txid bigint primary key,
  set_at timestamptz not null default now()
);

revoke all on private.linking_in_progress from public;
revoke all on private.linking_in_progress from authenticated;
revoke all on private.linking_in_progress from anon;
-- only the RPC's SECURITY DEFINER context (running as owner) can write/read.

-- =============================================
-- (1) maintenance_requests — INSERT lock
-- =============================================
-- المنطق: الطلب الجديد يبدأ من 'new' بدون أي assignment أو completion data.
-- التحوّل لباقي الحالات يحدث عبر UPDATE الذي يحرسه الـ trigger.
-- =============================================

drop policy if exists "maint_insert_member" on public.maintenance_requests;

create policy "maint_insert_member"
on public.maintenance_requests for insert
to authenticated
with check (
  public.is_building_member(building_id)
  -- Workflow integrity: new requests must start at 'new' with empty workflow fields.
  and status = 'new'
  and assigned_to is null
  and after_image_url is null
  and completed_at is null
  and related_expense_id is null
  and cost is null

  -- =============================================
  -- Codex round 5+6 P1 — Ownership & apartment scope checks
  -- =============================================
  -- requested_by: يجب أن يكون عضواً نشطاً في نفس العمارة (Codex round 6).
  -- بدون هذا الفحص، المدير يستطيع تسجيل طلب باسم مستخدم خارج العمارة،
  -- فيرى هذا المستخدم طلباً وصوراً من عمارة ليس فيها (RLS الـ SELECT تَمنح
  -- الوصول لـ requested_by مباشرة).
  and exists (
    select 1 from public.building_memberships bm
    where bm.building_id = maintenance_requests.building_id
      and bm.user_id    = maintenance_requests.requested_by
      and bm.is_active  = true
  )

  -- مَن يَحق له تعيين requested_by:
  --   - الساكن العادي: لـ auth.uid() فقط (لا انتحال).
  --   - المدير/اللجنة/super-admin: لأي عضو نشط في العمارة (سيناريو شرعي:
  --     ساكن يَتصل ويطلب من المدير فتح بلاغ نيابة عنه).
  and (
    requested_by = auth.uid()
    or public.is_super_admin()
    or public.user_has_role(
      building_id,
      array['admin', 'committee']::public.membership_role[]
    )
  )

  -- apartment_id: لو محدَّد، يجب أن يكون شقة المُنشئ نفسه (لغير المدير).
  -- المدير يستطيع فتح طلب على أي شقة. لو apartment_id IS NULL → طلب منطقة
  -- مشتركة (مدخل/مصعد/سطح/موقف)، مسموح للجميع.
  and (
    apartment_id is null
    or public.is_super_admin()
    or public.user_has_role(
      building_id,
      array['admin', 'committee']::public.membership_role[]
    )
    or exists (
      select 1 from public.apartment_members am
      where am.apartment_id = maintenance_requests.apartment_id
        and am.user_id = auth.uid()
        and am.is_active = true
    )
  )
);

-- =============================================
-- (2) maintenance_requests workflow trigger (BEFORE UPDATE — full table)
-- =============================================
-- درس Phase 7: BEFORE UPDATE فقط (لا OF status) لتغطية محاولات تعديل
-- الحقول دون لمس status.
-- =============================================

create or replace function public.maintenance_validate_transition()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  old_s public.maintenance_status := OLD.status;
  new_s public.maintenance_status := NEW.status;
  is_admin boolean;
  is_assignee boolean;
begin
  -- =============================================
  -- (Tenant lock) building_id immutable for the lifetime of the row.
  -- =============================================
  -- Codex round 4 P1: maint_update RLS تَفحص user_has_role(NEW.building_id) —
  -- لو الفني/الـ admin أعضاء في عمارتين، يستطيعون نقل الطلب بين عماراتهم
  -- بـ direct UPDATE، فيكسر tenant isolation ويُغيِّر FK الخاصة بالمصروف.
  -- لا يوجد سيناريو شرعي لتغيير building_id بعد الإنشاء.
  if NEW.building_id is distinct from OLD.building_id then
    raise exception 'building_id is immutable on maintenance_requests'
      using errcode = 'check_violation';
  end if;

  -- النقطة المرجعية: مَن المُحدِّث؟
  is_admin := public.is_super_admin()
    or public.user_has_role(NEW.building_id, array['admin', 'committee']::public.membership_role[]);
  is_assignee := auth.uid() is not null and auth.uid() = OLD.assigned_to;

  -- =============================================
  -- (A) Same-status update — تجميد حسب الدور والـ state
  -- =============================================
  if old_s = new_s then
    -- 'rejected' terminal: لا تعديل لأي حقل.
    if old_s = 'rejected' then
      if NEW.title              is distinct from OLD.title
         or NEW.description      is distinct from OLD.description
         or NEW.location_type    is distinct from OLD.location_type
         or NEW.priority         is distinct from OLD.priority
         or NEW.apartment_id     is distinct from OLD.apartment_id
         or NEW.assigned_to      is distinct from OLD.assigned_to
         or NEW.before_image_url is distinct from OLD.before_image_url
         or NEW.after_image_url  is distinct from OLD.after_image_url
         or NEW.cost             is distinct from OLD.cost
         or NEW.related_expense_id is distinct from OLD.related_expense_id
         or NEW.completed_at     is distinct from OLD.completed_at
      then
        raise exception 'Maintenance request in rejected state is locked'
          using errcode = 'check_violation';
      end if;
      return NEW;
    end if;

    -- الفني (assignee) في same-status: لا تعديل لأي حقل (Codex round 2 P1).
    -- after_image_url يُضبط فقط أثناء transition in_progress -> completed.
    -- بدون هذا التشديد، الفني يستطيع استبدال إثبات العمل بعد الإغلاق
    -- في same-status update على completed.
    if is_assignee and not is_admin then
      if NEW.title              is distinct from OLD.title
         or NEW.description      is distinct from OLD.description
         or NEW.location_type    is distinct from OLD.location_type
         or NEW.priority         is distinct from OLD.priority
         or NEW.apartment_id     is distinct from OLD.apartment_id
         or NEW.requested_by     is distinct from OLD.requested_by
         or NEW.assigned_to      is distinct from OLD.assigned_to
         or NEW.before_image_url is distinct from OLD.before_image_url
         or NEW.after_image_url  is distinct from OLD.after_image_url
         or NEW.cost             is distinct from OLD.cost
         or NEW.related_expense_id is distinct from OLD.related_expense_id
         or NEW.completed_at     is distinct from OLD.completed_at
      then
        raise exception 'Technician cannot edit fields without a status transition'
          using errcode = 'check_violation';
      end if;
      return NEW;
    end if;

    -- admin/committee في same-status update: نسمح فقط بتعديلات metadata غير حساسة:
    --   description, priority
    -- related_expense_id لا يتغيّر إلا عبر RPC link_maintenance_to_expense.
    -- بقية الحقول (title, location_type, apartment_id, requested_by, before_image_url,
    -- after_image_url, assigned_to, cost, completed_at) مُجمَّدة وتلزمها transition.
    -- (درس Codex round 3 P1: GUC قابل للتزوير من العميل، فالـ trigger
    -- يقرأ من private.linking_in_progress الذي لا يملك authenticated الكتابة عليه.)
    declare
      v_via_link_rpc boolean := exists (
        select 1 from private.linking_in_progress
        where txid = txid_current()
      );
    begin
      if NEW.title              is distinct from OLD.title
         or NEW.location_type    is distinct from OLD.location_type
         or NEW.apartment_id     is distinct from OLD.apartment_id
         or NEW.requested_by     is distinct from OLD.requested_by
         or NEW.assigned_to      is distinct from OLD.assigned_to
         or NEW.before_image_url is distinct from OLD.before_image_url
         or NEW.after_image_url  is distinct from OLD.after_image_url
         or NEW.cost             is distinct from OLD.cost
         or NEW.completed_at     is distinct from OLD.completed_at
         -- related_expense_id يتغيّر فقط عبر link_maintenance_to_expense RPC.
         or (NEW.related_expense_id is distinct from OLD.related_expense_id and not v_via_link_rpc)
      then
        raise exception
          'Maintenance request in % state is locked: only description/priority can change without a status transition (related_expense_id requires link_maintenance_to_expense RPC)',
          old_s
          using errcode = 'check_violation';
      end if;
    end;

    return NEW;
  end if;

  -- =============================================
  -- (B) Status transition — whitelist
  -- =============================================
  --   new              -> reviewing | rejected
  --   reviewing        -> waiting_quote | waiting_approval | rejected
  --   waiting_quote    -> waiting_approval | rejected
  --   waiting_approval -> in_progress | rejected
  --   in_progress      -> completed | reopened
  --   completed        -> reopened
  --   reopened         -> in_progress | reviewing
  --   rejected         -> (terminal — no transitions)
  if not (
    (old_s = 'new'              and new_s in ('reviewing', 'rejected'))
    or (old_s = 'reviewing'        and new_s in ('waiting_quote', 'waiting_approval', 'rejected'))
    or (old_s = 'waiting_quote'    and new_s in ('waiting_approval', 'rejected'))
    or (old_s = 'waiting_approval' and new_s in ('in_progress', 'rejected'))
    or (old_s = 'in_progress'      and new_s in ('completed', 'reopened'))
    or (old_s = 'completed'        and new_s = 'reopened')
    or (old_s = 'reopened'         and new_s in ('in_progress', 'reviewing'))
  ) then
    raise exception 'Invalid maintenance status transition: % -> %', old_s, new_s
      using errcode = 'check_violation';
  end if;

  -- =============================================
  -- (C) Technician restrictions during transitions
  -- =============================================
  -- الفني يستطيع فقط: in_progress -> completed | reopened (مع after_image لو completed)
  if is_assignee and not is_admin then
    if not (old_s = 'in_progress' and new_s in ('completed', 'reopened')) then
      raise exception 'Technician can only transition in_progress -> completed/reopened'
        using errcode = 'check_violation';
    end if;
  end if;

  -- =============================================
  -- (D) Required-fields per target status (Codex round 2 P1)
  -- =============================================
  -- 'completed' يستلزم after_image_url (إثبات الإنجاز). الـ trigger السابق
  -- منع تغيير after_image_url خارج هذا الـ transition، لكن لم يُلزم وجوده
  -- داخله. النتيجة: completion صامتة بدون صورة.
  if new_s = 'completed' and (NEW.after_image_url is null or length(trim(NEW.after_image_url)) = 0) then
    raise exception 'Cannot mark maintenance request as completed without after_image_url'
      using errcode = 'check_violation';
  end if;

  -- Auto-stamp completion timestamp (in_progress -> completed).
  if old_s = 'in_progress' and new_s = 'completed' then
    NEW.completed_at := coalesce(NEW.completed_at, now());
  end if;

  -- =============================================
  -- (E) Per-transition field whitelist
  -- =============================================
  -- (E.1) حقول مُجمَّدة في كل transition بدون استثناء:
  -- title, description, location_type, priority, apartment_id, requested_by, before_image_url
  -- (الـ before_image يمثّل توثيقاً للحالة الأصلية وقت الإنشاء.)
  if NEW.title           is distinct from OLD.title
     or NEW.description    is distinct from OLD.description
     or NEW.location_type  is distinct from OLD.location_type
     or NEW.priority       is distinct from OLD.priority
     or NEW.apartment_id   is distinct from OLD.apartment_id
     or NEW.requested_by   is distinct from OLD.requested_by
     or NEW.before_image_url is distinct from OLD.before_image_url
  then
    raise exception
      'Cannot change frozen fields (title/description/location/priority/apartment/requester/before_image) during transition % -> %',
      old_s, new_s
      using errcode = 'check_violation';
  end if;

  -- (E.2) assigned_to: يتغيّر فقط في:
  --   reviewing -> waiting_approval (admin يُسند لفني)
  --   waiting_approval -> in_progress (admin يُسند لفني نهائياً)
  --   reopened -> reviewing | in_progress (إعادة إسناد محتملة)
  if not (
    (old_s = 'reviewing' and new_s in ('waiting_quote', 'waiting_approval'))
    or (old_s = 'waiting_quote' and new_s = 'waiting_approval')
    or (old_s = 'waiting_approval' and new_s = 'in_progress')
    or (old_s = 'reopened' and new_s in ('in_progress', 'reviewing'))
  ) then
    if NEW.assigned_to is distinct from OLD.assigned_to then
      raise exception
        'assigned_to cannot change during transition % -> %',
        old_s, new_s
        using errcode = 'check_violation';
    end if;
  end if;

  -- (E.3) after_image_url: يتغيّر فقط في in_progress -> completed (إثبات إنجاز).
  if not (old_s = 'in_progress' and new_s = 'completed') then
    if NEW.after_image_url is distinct from OLD.after_image_url then
      raise exception
        'after_image_url cannot change during transition % -> %',
        old_s, new_s
        using errcode = 'check_violation';
    end if;
  end if;

  -- (E.4) completed_at: يتغيّر فقط في in_progress -> completed (auto-stamped above).
  if not (old_s = 'in_progress' and new_s = 'completed') then
    if NEW.completed_at is distinct from OLD.completed_at then
      raise exception
        'completed_at cannot change during transition % -> %',
        old_s, new_s
        using errcode = 'check_violation';
    end if;
  end if;

  -- (E.5) cost: يتغيّر فقط حين إضافة عرض السعر (reviewing -> waiting_quote/approval، أو waiting_quote -> approval).
  if not (
    (old_s = 'reviewing' and new_s in ('waiting_quote', 'waiting_approval'))
    or (old_s = 'waiting_quote' and new_s = 'waiting_approval')
  ) then
    if NEW.cost is distinct from OLD.cost then
      raise exception
        'cost cannot change during transition % -> %',
        old_s, new_s
        using errcode = 'check_violation';
    end if;
  end if;

  -- (E.6) related_expense_id: لا يتغيّر أثناء أي transition.
  -- الـ RPC link_maintenance_to_expense يُحدِّث الحقل بدون status change،
  -- فيمر عبر فرع (A) same-status حيث الـ GUC `app.linking_expense` تسمح به.
  if NEW.related_expense_id is distinct from OLD.related_expense_id then
    raise exception
      'related_expense_id cannot change during transition % -> % (use link_maintenance_to_expense RPC)',
      old_s, new_s
      using errcode = 'check_violation';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_maint_validate_transition on public.maintenance_requests;

create trigger trg_maint_validate_transition
  before update on public.maintenance_requests
  for each row
  execute function public.maintenance_validate_transition();

-- =============================================
-- (3) tasks — INSERT lock + simpler workflow
-- =============================================
-- المهام أبسط من الصيانة (شخصي/إدارة فريق). حالات: todo, in_progress, waiting_external, completed.
-- 'overdue' محسوبة من due_date في الـ queries (لا تُخزَّن كحالة).
-- transitions مرنة: any non-terminal -> any non-terminal (admin/assignee حرية في المتابعة).
-- لكن نقفل INSERT على status='todo' كباقي الجداول.
-- =============================================

drop policy if exists "tasks_insert_admin_committee" on public.tasks;

create policy "tasks_insert_admin_committee"
on public.tasks for insert
to authenticated
with check (
  (
    public.user_has_role(
      building_id,
      array['admin', 'committee']::public.membership_role[]
    )
    or public.is_super_admin()
  )
  -- Workflow integrity: new tasks start at 'todo'.
  and status = 'todo'
);

-- Tasks لا تحتاج transition trigger صارم، لكن نمنع عودة 'completed' إلى حالات سابقة
-- بدون reopen صريح (تُترك للمستخدم لو قرّر "أعدت فتح المهمة").
-- نكتفي بـ INSERT lock — مرونة الـ workflow تسمح بأي تنقّل بين الحالات الأربع
-- (لأن الـ task tracker مختلف عن workflow مالي).

-- =============================================
-- (3b) Block 'overdue' as a stored value (Codex round 3 P2)
-- =============================================
-- enum task_status يحتوي 'overdue' لأسباب تاريخية، لكن PLAN يَنُص أنها
-- محسوبة من due_date في الـ queries. بدون CHECK، أي admin أو assignee
-- يستطيع تنفيذ UPDATE status='overdue' مباشرة عبر Supabase client،
-- فيكسر نموذج الحالات الأربع ويُخرج المهمة من أعمدة الـ board.
-- =============================================

alter table public.tasks
  drop constraint if exists chk_tasks_no_overdue_storage;

alter table public.tasks
  add constraint chk_tasks_no_overdue_storage
  check (status <> 'overdue');

-- =============================================
-- (3c) Tenant lock + audit lock on tasks (Codex round 4 P1)
-- =============================================
-- سياسة tasks_update تَسمح للـ assignee أو admin/committee بالتحديث.
-- WITH CHECK تَفحص NEW.assigned_to=auth.uid() أو role، لكنها لا تمنع
-- تغيير building_id. assignee يستطيع نقل المهمة لـ building_id آخر،
-- فتظهر تحت سياق عمارة خاطئ ويُكسر tenant isolation.
-- created_by أيضاً audit field يجب ألا يتغيّر.
-- =============================================

create or replace function public.tasks_validate_update()
returns trigger
language plpgsql
as $$
begin
  if NEW.building_id is distinct from OLD.building_id then
    raise exception 'building_id is immutable on tasks'
      using errcode = 'check_violation';
  end if;
  if NEW.created_by is distinct from OLD.created_by then
    raise exception 'created_by is immutable on tasks'
      using errcode = 'check_violation';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_tasks_validate_update on public.tasks;

create trigger trg_tasks_validate_update
  before update on public.tasks
  for each row
  execute function public.tasks_validate_update();

-- =============================================
-- (4) Storage: maintenance bucket orphan-only DELETE
-- =============================================
-- درس Codex P2.2 من Phase 6 مُعمَّماً: bucket maintenance لا يحوي DELETE policy
-- → لو فشل insert صف maintenance_requests بعد رفع before_image، الملف يبقى يتيماً.
-- الحل: orphan-only delete (ملف غير مرتبط بأي maintenance_request).
-- =============================================

create policy "maintenance_delete_own_orphan"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'maintenance'
  and owner = auth.uid()
  and not exists (
    select 1 from public.maintenance_requests
    where before_image_url = storage.objects.name
       or after_image_url = storage.objects.name
  )
);

-- =============================================
-- (5) Tighten storage SELECT policy to mirror row-level RLS
-- =============================================
-- Codex round 2 P2: السياسة السابقة "maintenance_select_members" كانت تسمح
-- لأي عضو في العمارة بقراءة أي صورة صيانة طالما هي في building folder.
-- لكن RLS على maintenance_requests تقصر الفني على طلباته والساكن على طلباته،
-- فلو تسرّب مسار ملف، أي عضو يقرأه دون صلاحية رؤية صف الـ request.
--
-- الحل: SELECT يتطلب وجود maintenance_request يُشير لهذا الملف،
-- ويسمح للمستخدم بنفس منطق maint_select_relevant (admin/committee/treasurer
-- في العمارة، أو requested_by، أو assigned_to، أو super_admin).
--
-- ملاحظة: ملفات قبل الربط بالـ row (orphan أثناء الإنشاء) لا تُقرأ — وهذا
-- مقبول لأن الـ uploader لا يحتاج لقراءتها قبل ربطها (الـ signed URL
-- يُولَّد بعد الإنشاء).
-- =============================================

drop policy if exists "maintenance_select_members" on storage.objects;

create policy "maintenance_select_relevant"
on storage.objects for select
to authenticated
using (
  bucket_id = 'maintenance'
  and (
    public.is_super_admin()
    or exists (
      select 1 from public.maintenance_requests m
      where (m.before_image_url = storage.objects.name
             or m.after_image_url = storage.objects.name)
        and (
          public.user_has_role(
            m.building_id,
            array['admin', 'committee', 'treasurer']::public.membership_role[]
          )
          or m.requested_by = auth.uid()
          or m.assigned_to = auth.uid()
        )
    )
  )
);

-- =============================================
-- (6) Atomic link: maintenance_request -> expense
-- =============================================
-- Codex round 2 P2: linkMaintenanceToExpenseAction كانت "قراءة → INSERT
-- expense → UPDATE related_expense_id" في 3 خطوات منفصلة. سباق بين مديرين
-- يُنشئ مصروفَين، آخر UPDATE يربط واحداً ويترك الآخر مسودّة يتيمة.
-- الحل: SECURITY DEFINER function تَقفل الصف بـ FOR UPDATE وتُنفِّذ الكل
-- في transaction واحدة.
-- =============================================

create or replace function public.link_maintenance_to_expense(
  p_request_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_request public.maintenance_requests%rowtype;
  v_expense_id uuid;
  v_caller uuid := auth.uid();
  v_is_manager boolean;
begin
  if v_caller is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  -- Lock the request row for the duration of this transaction.
  select * into v_request from public.maintenance_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Maintenance request not found' using errcode = 'P0002';
  end if;

  v_is_manager := public.is_super_admin() or public.user_has_role(
    v_request.building_id,
    array['admin', 'committee']::public.membership_role[]
  );

  if not v_is_manager then
    raise exception 'Access denied: admin/committee only' using errcode = 'P0003';
  end if;

  if v_request.related_expense_id is not null then
    raise exception 'Already linked to expense %', v_request.related_expense_id
      using errcode = 'P0004';
  end if;

  if v_request.status in ('new', 'rejected') then
    raise exception 'Cannot create expense from request in % state', v_request.status
      using errcode = 'P0005';
  end if;

  -- Create the draft expense.
  v_expense_id := gen_random_uuid();
  insert into public.expenses (
    id, building_id, title, amount, status, created_by
  ) values (
    v_expense_id,
    v_request.building_id,
    'صيانة: ' || v_request.title,
    coalesce(v_request.cost, 0),
    'draft',
    v_caller
  );

  -- Mark this transaction as a legitimate link operation. Only this
  -- SECURITY DEFINER function can write to private.linking_in_progress
  -- (authenticated has no INSERT grant). Trigger reads it to permit the
  -- same-status related_expense_id change.
  insert into private.linking_in_progress (txid)
  values (txid_current())
  on conflict (txid) do nothing;

  -- Link the expense to the request (same-status update; trigger sees the marker).
  update public.maintenance_requests
  set related_expense_id = v_expense_id
  where id = p_request_id
    and related_expense_id is null;  -- Defensive: should always be true under FOR UPDATE.

  if not found then
    -- This should be impossible (we hold a row lock), but guard anyway.
    raise exception 'Concurrent link detected — aborting' using errcode = 'P0006';
  end if;

  -- Clean up the marker (the row would also disappear with txn rollback,
  -- but explicit delete keeps the table tidy after commit).
  delete from private.linking_in_progress where txid = txid_current();

  return v_expense_id;
end;
$$;

grant execute on function public.link_maintenance_to_expense(uuid) to authenticated;

-- End 11_phase8.sql
