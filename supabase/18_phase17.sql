-- =============================================
-- 18_phase17.sql — Phase 17 (Building Join Links + Resident Pending Approval)
-- =============================================
-- يطبَّق بعد 17_phase16.sql.
--
-- الهدف: تَمكين الـ admin من إصدار رابط دعوة عام للسكان، يَستخدمه الزائر
-- للتسجيل بنفسه، ثم admin يُوافق يدوياً.
--
-- المبدأ المعماري المُحمَّل من Phase 16 (دروس #18 + #20 + #28):
--   1. لا direct anon table access — كل الـ public surface عبر SECURITY
--      DEFINER RPCs.
--   2. tokens hashed (SHA-256)، الـ raw يَظهر مرة واحدة وفقط في URL.
--   3. rate limit في server action layer (HTTP فقط)، ليس في DB.
--   4. الـ RPCs server-only (submit_join_request) أو anon-callable مع
--      validation داخلية (resolve_building_join_token).
--
-- مَكوِّنات هذا الملف:
--   1. building_join_links — token_hash + expires_at + disabled_at + max_uses
--   2. pending_apartment_members — holding zone للطلبات
--   3. workflow trigger على pending_apartment_members
--   4. 5 RPCs:
--      - create_building_join_link (admin only، يُولِّد raw token)
--      - resolve_building_join_token (anon-callable، read-only)
--      - submit_join_request (server-only via service_role، atomic)
--      - approve_pending_member (admin only)
--      - reject_pending_member (admin only)
-- =============================================

-- =============================================
-- (1) building_join_links — tokens hashed
-- =============================================
-- الـ raw token يَظهر مرة واحدة عند الإنشاء (UI admin)، يُحفَظ hash فقط.
-- anon لا يَلمس هذا الجدول مباشرةً (RLS deny-all أدناه). الـ resolve/submit
-- RPCs هما الـ surface الوحيد للـ public.
-- =============================================

create table if not exists public.building_join_links (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  token_hash text not null unique,             -- SHA-256(raw_token) — RAW NEVER STORED

  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz,                      -- nullable = no expiry
  disabled_at timestamptz,                     -- soft disable

  uses_count int not null default 0,
  max_uses int                                 -- nullable = unlimited
);

-- Index للبحث السريع بالـ hash (يَستخدمه RPCs)
create index if not exists idx_building_join_links_hash_active
  on public.building_join_links (token_hash)
  where disabled_at is null;

-- updated_at-style trigger للـ disabled_at + uses_count tracking
-- (لا حاجة لعمود updated_at مَنفصل — التَتبُّع via uses_count + disabled_at)

-- RLS: anon = 0 access. admin (للعمارة) + super_admin يَقرؤون فقط.
-- v3.35 (Codex round 2 P1): NO direct INSERT/UPDATE policies على هذا الجدول.
-- ===========================================================================
-- المسارات المسموحة (lifecycle مَحصور بالـ RPCs):
--   - INSERT: حصراً عبر create_building_join_link RPC (يَفرض admin role + hash مَحسوب)
--   - UPDATE uses_count: حصراً عبر submit_join_request RPC (atomic SELECT FOR UPDATE)
--   - UPDATE disabled_at: حصراً عبر disable_join_link RPC (أدناه)
--   - DELETE: غير مَسموح (audit trail محفوظ)
--
-- لو أَبقينا INSERT/UPDATE policies للـ admin، يَستطيع الـ admin عبر Supabase
-- client (أو UI inspector) أن:
--   - يُصفِّر uses_count بعد تَجاوز max_uses
--   - يُغيِّر token_hash إلى token معروف/مَسرَّب
--   - يَنقل الرابط لعمارة أخرى عبر تَغيير building_id
--   - يَمد expires_at بلا حدود
-- كل هذا بدون trigger يَحمي الحقول. الـ RPCs SECURITY DEFINER تَتجاوز RLS
-- وتَحفظ القيود — هي المسار الوحيد المَسموح.
-- ===========================================================================
alter table public.building_join_links enable row level security;

drop policy if exists "join_links_select_admin" on public.building_join_links;
create policy "join_links_select_admin"
  on public.building_join_links for select
  to authenticated
  using (
    public.is_super_admin()
    or public.user_has_role(building_id, array['admin']::public.membership_role[])
  );

-- v3.35: dropped (no direct INSERT/UPDATE — RPCs only)
drop policy if exists "join_links_insert_admin" on public.building_join_links;
drop policy if exists "join_links_update_admin" on public.building_join_links;
-- لا policy لـ DELETE — soft disable عبر disable_join_link RPC، لا حذف فعلي.

-- =============================================
-- (2) pending_apartment_members — holding zone
-- =============================================
-- الساكن يُسجِّل عبر /join/<token>، يَدخل هنا بحالة pending. admin يُراجع
-- ويُوافق (→ INSERT في apartment_members) أو يَرفض.
-- =============================================

create table if not exists public.pending_apartment_members (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  join_link_id uuid references public.building_join_links(id) on delete set null,  -- audit

  -- ما أَدخله الساكن أثناء التسجيل (نَصّاً، admin يَربطه بـ apartment_id الفعلي)
  requested_apartment_number text,
  full_name text,
  phone text,

  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),

  -- مستخدم واحد لا يُكرِّر طلب لنفس العمارة
  unique (building_id, user_id),
  -- rejected → يَتطلَّب reason
  check (status <> 'rejected' or (rejection_reason is not null and length(rejection_reason) >= 3)),
  -- approved → يَتطلَّب reviewed_by + reviewed_at
  check (status <> 'approved' or (reviewed_by is not null and reviewed_at is not null))
);

create index if not exists idx_pending_members_building_status
  on public.pending_apartment_members (building_id, status, created_at desc);
create index if not exists idx_pending_members_user
  on public.pending_apartment_members (user_id);

-- =============================================
-- (3) workflow trigger على pending_apartment_members
-- =============================================
-- - building_id + user_id + join_link_id immutable
-- - submission fields immutable (requested_apartment_number، full_name، phone)
-- - status transitions: pending → approved | rejected (terminal)
-- - rejected → pending (admin retry — مَسموح)
-- - approved → terminal
-- - resident لا يَستطيع تَغيير status بنفسه (فقط RPCs)
-- =============================================

create or replace function public.pending_member_validate_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- audit + identity fields immutable
  if NEW.created_at is distinct from OLD.created_at then
    raise exception 'created_at is immutable on pending_apartment_members'
      using errcode = 'check_violation';
  end if;
  if NEW.building_id is distinct from OLD.building_id
     or NEW.user_id is distinct from OLD.user_id
     or NEW.join_link_id is distinct from OLD.join_link_id then
    raise exception 'identity fields are immutable on pending_apartment_members'
      using errcode = 'check_violation';
  end if;
  -- submission fields immutable (الساكن أدخلها — لا تَغيير لاحقاً)
  if NEW.requested_apartment_number is distinct from OLD.requested_apartment_number
     or NEW.full_name is distinct from OLD.full_name
     or NEW.phone is distinct from OLD.phone then
    raise exception 'submission fields are immutable on pending_apartment_members'
      using errcode = 'check_violation';
  end if;

  -- transition whitelist
  if NEW.status is distinct from OLD.status then
    if not (
      (OLD.status = 'pending'  and NEW.status in ('approved', 'rejected'))
      or (OLD.status = 'rejected' and NEW.status = 'pending')  -- admin retry
    ) then
      raise exception 'invalid pending_apartment_members transition: % -> %',
        OLD.status, NEW.status using errcode = 'check_violation';
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_pending_member_validate_update on public.pending_apartment_members;
create trigger trg_pending_member_validate_update
  before update on public.pending_apartment_members
  for each row
  execute function public.pending_member_validate_update();

-- RLS:
--   - SELECT: المستخدم نفسه (يَرى طلبه) + admin العمارة + super_admin
--   - INSERT: حصراً عبر submit_join_request RPC (server-only). لا anon INSERT.
--   - UPDATE: حصراً عبر approve_pending_member / reject_pending_member RPCs.
--     لا direct UPDATE policy (v3.35 fix لـ Codex round 2 P1).
--   - DELETE: admin/super_admin (للتَنظيف اليدوي للـ orphans)
--
-- v3.35 السياق: لو أَبقينا UPDATE policy للـ admin، يَستطيع admin عبر Supabase
-- client أن يُحدِّث status='approved' مباشرةً. الـ trigger يَسمح بـ pending→approved
-- (transition صحيح). لكن link_apartment_member NEVER يُستدعى → لا apartment_members
-- INSERT → الساكن "مُعتَمَد" بلا صلاحية فعلية. الـ RPCs SECURITY DEFINER تَتجاوز
-- RLS وتَفرض الـ INSERT الذرّي — هي المسار الوحيد لتَجنُّب orphan-approval.
alter table public.pending_apartment_members enable row level security;

drop policy if exists "pending_select_self_or_admin" on public.pending_apartment_members;
create policy "pending_select_self_or_admin"
  on public.pending_apartment_members for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_super_admin()
    or public.user_has_role(building_id, array['admin']::public.membership_role[])
  );

-- v3.35: dropped — UPDATE حصراً عبر approve/reject RPCs.
drop policy if exists "pending_update_admin" on public.pending_apartment_members;

-- لا anon INSERT policy — المسار الوحيد عبر submit_join_request RPC server-only
drop policy if exists "pending_insert_anon" on public.pending_apartment_members;

drop policy if exists "pending_delete_admin" on public.pending_apartment_members;
create policy "pending_delete_admin"
  on public.pending_apartment_members for delete
  to authenticated
  using (
    public.is_super_admin()
    or public.user_has_role(building_id, array['admin']::public.membership_role[])
  );

-- =============================================
-- (4) RPCs — public surface for /join flow
-- =============================================

-- (4a) create_building_join_link — admin only
-- ===========================================
-- يُولِّد raw token (يُمرَّر من server action عبر node:crypto.randomBytes)،
-- يَحسب SHA-256 hash، يُنشئ row، يَرجع الـ row id.
-- الـ raw token NOT حُفظ — server action يَحتفظ به لعرض UI مرة واحدة.
-- ===========================================
create or replace function public.create_building_join_link(
  p_building_id uuid,
  p_token_hash text,                  -- pre-computed SHA-256 من server action
  p_expires_at timestamptz,           -- nullable
  p_max_uses int                      -- nullable
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_user_id uuid := auth.uid();
begin
  -- admin/super_admin only
  if not (
    public.is_super_admin()
    or public.user_has_role(p_building_id, array['admin']::public.membership_role[])
  ) then
    raise exception 'Access denied: admin only' using errcode = 'P0003';
  end if;

  if p_token_hash is null or length(p_token_hash) < 32 then
    raise exception 'invalid token hash' using errcode = 'check_violation';
  end if;

  -- v3.36 (Codex round 3 P2): ROTATION semantic — disable any active links
  -- for this building before inserting the new one. PLAN acceptance criterion:
  -- "admin يُمكنه توليد token جديد (يُلغي القديم disabled_at=now())".
  --
  -- Without this, a leaked old link stays valid until expiry/max_uses even
  -- after admin generates a new one. Atomicity is guaranteed because UPDATE
  -- + INSERT live in the same transaction (PostgreSQL function = transaction).
  --
  -- Definition of "active" here matches resolve_building_join_token: any row
  -- with disabled_at IS NULL, regardless of expires_at/max_uses (those are
  -- different checks). We disable ALL of them — generating a new link is an
  -- explicit rotation gesture by admin.
  update public.building_join_links
  set disabled_at = now()
  where building_id = p_building_id
    and disabled_at is null;

  insert into public.building_join_links
    (building_id, token_hash, created_by, expires_at, max_uses)
  values
    (p_building_id, p_token_hash, v_user_id, p_expires_at, p_max_uses)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_building_join_link(uuid, text, timestamptz, int)
  to authenticated;

-- (4b) resolve_building_join_token — anon callable
-- ================================================
-- يَحسب hash من الـ raw token (داخلياً عبر pg_catalog.digest، أو بـ server-side
-- pre-hash). pglite/postgres يَفتقران لـ pgcrypto بشكل افتراضي، لذا نَستلم الـ
-- hash مَحسوباً من server action (نفس نمط create_link).
--
-- يَفحص: hash exists + not disabled + not expired + uses_count < max_uses +
-- building subscription active.
--
-- يُرجع: building info محدودة عند النجاح، أو enum خطأ للـ UI.
-- لا يَزيد uses_count (الزيادة فقط في submit_join_request).
-- ================================================
create or replace function public.resolve_building_join_token(
  p_token_hash text
) returns table (
  building_id uuid,
  building_name text,
  city text,
  error_code text                     -- null on success
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_link record;
  v_building record;
begin
  if p_token_hash is null or length(p_token_hash) < 32 then
    return query select null::uuid, null::text, null::text, 'invalid'::text;
    return;
  end if;

  select bjl.id, bjl.building_id, bjl.expires_at, bjl.disabled_at,
         bjl.uses_count, bjl.max_uses
  into v_link
  from public.building_join_links bjl
  where bjl.token_hash = p_token_hash;

  if not found then
    return query select null::uuid, null::text, null::text, 'invalid'::text;
    return;
  end if;

  if v_link.disabled_at is not null then
    return query select null::uuid, null::text, null::text, 'disabled'::text;
    return;
  end if;

  if v_link.expires_at is not null and v_link.expires_at < now() then
    return query select null::uuid, null::text, null::text, 'expired'::text;
    return;
  end if;

  if v_link.max_uses is not null and v_link.uses_count >= v_link.max_uses then
    return query select null::uuid, null::text, null::text, 'max_uses_reached'::text;
    return;
  end if;

  -- subscription check (Phase 14)
  if not public.is_building_active_subscription(v_link.building_id) then
    return query select null::uuid, null::text, null::text, 'building_inactive'::text;
    return;
  end if;

  -- success: return limited public info
  select b.id, b.name, b.city
  into v_building
  from public.buildings b
  where b.id = v_link.building_id;

  return query
  select v_building.id, v_building.name, v_building.city, null::text;
end;
$$;

grant execute on function public.resolve_building_join_token(text) to anon, authenticated;

-- (4c) submit_join_request — server-only (atomic INSERT + uses_count++)
-- =====================================================================
-- يُستدعى من server action via createAdminClient() بعد:
--   - rate limit في الـ action
--   - signup/auth confirmation (المستخدم authenticated)
--   - الـ action يَمرر user_id صريحاً (لأن service_role context)
--
-- ATOMIC:
--   - SELECT FOR UPDATE على building_join_links لقفل uses_count
--   - re-validate كل الشروط
--   - INSERT في pending_apartment_members
--   - UPDATE uses_count + 1
-- =====================================================================
create or replace function public.submit_join_request(
  p_user_id uuid,
  p_token_hash text,
  p_full_name text,
  p_apartment_number text,           -- nullable
  p_phone text                       -- nullable
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_link record;
  v_pending_id uuid;
begin
  -- input validation
  if p_user_id is null then
    raise exception 'user_id required' using errcode = 'check_violation';
  end if;
  if p_token_hash is null or length(p_token_hash) < 32 then
    raise exception 'invalid token hash' using errcode = 'check_violation';
  end if;
  if p_full_name is null or length(p_full_name) < 2 or length(p_full_name) > 120 then
    raise exception 'invalid full_name' using errcode = 'check_violation';
  end if;
  if p_apartment_number is not null and length(p_apartment_number) > 30 then
    raise exception 'apartment_number too long' using errcode = 'check_violation';
  end if;
  if p_phone is not null and length(p_phone) > 40 then
    raise exception 'phone too long' using errcode = 'check_violation';
  end if;

  -- atomic lock + re-validate + INSERT + uses_count++
  select id, building_id, expires_at, disabled_at, uses_count, max_uses
  into v_link
  from public.building_join_links
  where token_hash = p_token_hash
  for update;

  if not found then
    raise exception 'invalid token' using errcode = 'P0002';
  end if;
  if v_link.disabled_at is not null then
    raise exception 'token disabled' using errcode = 'P0003';
  end if;
  if v_link.expires_at is not null and v_link.expires_at < now() then
    raise exception 'token expired' using errcode = 'P0003';
  end if;
  if v_link.max_uses is not null and v_link.uses_count >= v_link.max_uses then
    raise exception 'max uses reached' using errcode = 'P0003';
  end if;
  if not public.is_building_active_subscription(v_link.building_id) then
    raise exception 'building inactive' using errcode = 'P0003';
  end if;

  -- INSERT pending row (unique violation if duplicate user+building)
  insert into public.pending_apartment_members
    (building_id, user_id, join_link_id,
     requested_apartment_number, full_name, phone, status)
  values
    (v_link.building_id, p_user_id, v_link.id,
     nullif(p_apartment_number, ''), p_full_name, nullif(p_phone, ''), 'pending')
  returning id into v_pending_id;

  -- atomic increment
  update public.building_join_links
  set uses_count = uses_count + 1
  where id = v_link.id;

  return v_pending_id;
end;
$$;

revoke execute on function public.submit_join_request(uuid, text, text, text, text)
  from public;
grant execute on function public.submit_join_request(uuid, text, text, text, text)
  to service_role;

-- (4d) approve_pending_member — admin only
-- ========================================
-- ATOMIC:
--   - SELECT FOR UPDATE على pending row
--   - INSERT في apartment_members
--   - UPDATE pending status='approved'
-- ========================================
create or replace function public.approve_pending_member(
  p_pending_id uuid,
  p_apartment_id uuid,
  p_relation_type public.apartment_relation
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pending record;
  v_apt_building_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  -- lock pending row + verify status
  select id, building_id, user_id, status
  into v_pending
  from public.pending_apartment_members
  where id = p_pending_id
  for update;

  if not found then
    raise exception 'pending request not found' using errcode = 'P0002';
  end if;
  if v_pending.status <> 'pending' then
    raise exception 'pending request already %', v_pending.status using errcode = 'P0003';
  end if;

  -- admin/super_admin only on this building
  if not (
    public.is_super_admin()
    or public.user_has_role(v_pending.building_id, array['admin']::public.membership_role[])
  ) then
    raise exception 'Access denied: admin only' using errcode = 'P0003';
  end if;

  -- verify apartment belongs to same building (composite tenant check)
  select building_id into v_apt_building_id
  from public.apartments where id = p_apartment_id;

  if v_apt_building_id is null or v_apt_building_id <> v_pending.building_id then
    raise exception 'apartment not in this building' using errcode = 'check_violation';
  end if;

  -- Delegate to link_apartment_member (Phase 5 RPC) for the actual INSERT.
  -- This keeps voting-rep auto-assignment logic centralized and ensures any
  -- future changes (e.g., audit notes, additional checks) propagate to both
  -- entry points (admin direct via LinkMemberDialog + admin approve here).
  perform public.link_apartment_member(p_apartment_id, v_pending.user_id, p_relation_type);

  -- mark pending as approved
  update public.pending_apartment_members
  set status = 'approved',
      reviewed_by = v_user_id,
      reviewed_at = now()
  where id = p_pending_id;
end;
$$;

grant execute on function public.approve_pending_member(uuid, uuid, public.apartment_relation)
  to authenticated;

-- (4e) reject_pending_member — admin only
-- =======================================
create or replace function public.reject_pending_member(
  p_pending_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pending record;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_reason is null or length(p_reason) < 3 or length(p_reason) > 500 then
    raise exception 'rejection_reason must be 3-500 chars' using errcode = 'check_violation';
  end if;

  select id, building_id, status
  into v_pending
  from public.pending_apartment_members
  where id = p_pending_id
  for update;

  if not found then
    raise exception 'pending request not found' using errcode = 'P0002';
  end if;
  if v_pending.status <> 'pending' then
    raise exception 'pending request already %', v_pending.status using errcode = 'P0003';
  end if;

  if not (
    public.is_super_admin()
    or public.user_has_role(v_pending.building_id, array['admin']::public.membership_role[])
  ) then
    raise exception 'Access denied: admin only' using errcode = 'P0003';
  end if;

  update public.pending_apartment_members
  set status = 'rejected',
      rejection_reason = p_reason,
      reviewed_by = v_user_id,
      reviewed_at = now()
  where id = p_pending_id;
end;
$$;

grant execute on function public.reject_pending_member(uuid, text) to authenticated;

-- (4f) disable_join_link — admin only, soft disable (no delete)
-- =============================================================
-- v3.35 (Codex round 2 P1): replaces direct admin UPDATE on disabled_at.
-- بعد إغلاق UPDATE policy، الـ disable يَتم حصراً عبر هذا الـ RPC.
-- idempotent: استدعاؤه على رابط مُعطَّل بالفعل = no-op (لا exception).
-- =============================================================
create or replace function public.disable_join_link(p_link_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_building_id uuid;
begin
  select building_id into v_building_id
  from public.building_join_links where id = p_link_id;

  if v_building_id is null then
    raise exception 'link not found' using errcode = 'P0002';
  end if;

  if not (
    public.is_super_admin()
    or public.user_has_role(v_building_id, array['admin']::public.membership_role[])
  ) then
    raise exception 'Access denied: admin only' using errcode = 'P0003';
  end if;

  -- coalesce keeps the original disabled_at if already disabled (idempotent)
  update public.building_join_links
  set disabled_at = coalesce(disabled_at, now())
  where id = p_link_id;
end;
$$;

grant execute on function public.disable_join_link(uuid) to authenticated;

-- End 18_phase17.sql
