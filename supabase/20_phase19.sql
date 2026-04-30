-- =============================================
-- 20_phase19.sql — Phase 19 (Team + Renewals + Plan Changes + Bulk Import + Reminders)
-- =============================================
-- يطبَّق بعد 19_phase18.sql.
--
-- الهدف: إكمال الفجوات التشغيلية بعد Phase 18:
--   1. /team للأدوار غير-المُرتبطة بشقة (treasurer/committee/technician)
--   2. Renewal self-service — الـ admin يَطلب تَجديد عبر /subscribe?renew=true
--   3. Plan change — super_admin يُرقي/يُخفِّض باقة عمارة موجودة (pro-rated)
--   4. Bulk import — admin يَرفع CSV/XLSX لشقق أو سكان دفعة واحدة (atomic)
--   5. Reminders — cron يَومي يُرسل تَذكير 30/14/7 يوم قبل انتهاء الاشتراك
--
-- الدروس المُطبَّقة (#1-#38 من المراحل السابقة):
--   - SECURITY DEFINER RPCs لكل WRITE (#28، #31)
--   - private marker pattern للـ cron bypass (#6، #38)
--   - hashed tokens مع split counters (#28)
--   - rate limit في server action layer (#20)
--   - Reserve/Complete/Fail pattern للعمليات بـ side effects (#19)
--   - snapshot pricing (#11، #36)
--   - immutability على core fields بعد INSERT
--   - idempotency على cron-scheduled emails
-- =============================================

-- =============================================
-- (1) Extend subscription_orders for renewal/plan-change
-- =============================================
-- v0.19: orders تَخدم الآن 3 سيناريوهات:
--   (a) New building (Phase 18 الأصلي): is_renewal=false، renews_building_id=null
--   (b) Renewal فقط: is_renewal=true، renews_building_id NOT NULL، is_plan_change=false
--   (c) Renewal + plan change: is_renewal=true، is_plan_change=true، previous_tier_id NOT NULL
--
-- snapshot pricing (lesson #11): previous_tier_id يَحفظ الباقة قبل التَغيير
-- (للـ audit trail + reports). amount/total_amount snapshot من الـ tier الحالي
-- وقت إنشاء الـ order (لا تَأثُّر بأي تَغيير لاحق على subscription_tiers).
-- =============================================
alter table public.subscription_orders
  add column if not exists is_renewal boolean not null default false;
alter table public.subscription_orders
  add column if not exists renews_building_id uuid
  references public.buildings(id) on delete set null;
alter table public.subscription_orders
  add column if not exists is_plan_change boolean not null default false;
alter table public.subscription_orders
  add column if not exists previous_tier_id text
  references public.subscription_tiers(id);

-- coherence constraints
alter table public.subscription_orders
  drop constraint if exists chk_renewal_fields;
alter table public.subscription_orders
  add constraint chk_renewal_fields check (
    -- (a) new building order: no renewal fields
    (is_renewal = false
     and renews_building_id is null
     and is_plan_change = false
     and previous_tier_id is null)
    or
    -- (b/c) renewal: renews_building_id required
    (is_renewal = true and renews_building_id is not null
     and (
       -- (b) renewal only: previous_tier_id null OR equal to current (no change)
       (is_plan_change = false)
       or
       -- (c) renewal + plan change: previous != current
       (is_plan_change = true and previous_tier_id is not null
        and previous_tier_id <> tier_id)
     ))
  );

-- index for finding building's renewal orders (super-admin UI)
create index if not exists idx_orders_renews_building
  on public.subscription_orders (renews_building_id, status)
  where renews_building_id is not null;

-- =============================================
-- (2) subscription_orders trigger — extend immutability for renewal fields
-- =============================================
create or replace function public.subscription_orders_validate_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- audit + identity fields immutable
  if NEW.created_at is distinct from OLD.created_at then
    raise exception 'created_at is immutable on subscription_orders'
      using errcode = 'check_violation';
  end if;
  if NEW.reference_number is distinct from OLD.reference_number
     or NEW.access_token_hash is distinct from OLD.access_token_hash
     or NEW.tier_id is distinct from OLD.tier_id
     or NEW.cycle is distinct from OLD.cycle
     or NEW.amount is distinct from OLD.amount
     or NEW.vat_amount is distinct from OLD.vat_amount
     or NEW.total_amount is distinct from OLD.total_amount
     or NEW.currency is distinct from OLD.currency then
    raise exception 'order identity/pricing fields are immutable'
      using errcode = 'check_violation';
  end if;
  -- submitter-provided fields immutable (snapshot)
  if NEW.email is distinct from OLD.email
     or NEW.full_name is distinct from OLD.full_name
     or NEW.phone is distinct from OLD.phone
     or NEW.building_name is distinct from OLD.building_name
     or NEW.city is distinct from OLD.city
     or NEW.estimated_apartments is distinct from OLD.estimated_apartments then
    raise exception 'submission fields are immutable on subscription_orders'
      using errcode = 'check_violation';
  end if;

  -- v0.19 (Phase 19): renewal fields are also immutable post-INSERT
  if NEW.is_renewal is distinct from OLD.is_renewal
     or NEW.renews_building_id is distinct from OLD.renews_building_id
     or NEW.is_plan_change is distinct from OLD.is_plan_change
     or NEW.previous_tier_id is distinct from OLD.previous_tier_id then
    raise exception 'renewal/plan-change fields are immutable on subscription_orders'
      using errcode = 'check_violation';
  end if;

  -- transition whitelist (unchanged from Phase 18)
  if NEW.status is distinct from OLD.status then
    if not (
      (OLD.status = 'awaiting_payment' and NEW.status in ('awaiting_review', 'expired'))
      or (OLD.status = 'awaiting_review' and NEW.status in ('provisioning', 'rejected'))
      or (OLD.status = 'provisioning' and NEW.status in ('approved', 'provisioning_failed'))
      or (OLD.status = 'provisioning_failed' and NEW.status in ('awaiting_review', 'rejected'))
      or (OLD.status = 'rejected' and NEW.status = 'awaiting_review')
    ) then
      raise exception 'invalid subscription_orders transition: % -> %',
        OLD.status, NEW.status using errcode = 'check_violation';
    end if;
  end if;

  -- provisioned_* immutable once set
  if OLD.provisioned_building_id is not null
     and NEW.provisioned_building_id is distinct from OLD.provisioned_building_id then
    raise exception 'provisioned_building_id is immutable once set'
      using errcode = 'check_violation';
  end if;
  if OLD.provisioned_user_id is not null
     and NEW.provisioned_user_id is distinct from OLD.provisioned_user_id then
    raise exception 'provisioned_user_id is immutable once set'
      using errcode = 'check_violation';
  end if;

  return NEW;
end;
$$;

-- (trigger itself unchanged — already attached in 19_phase18.sql)

-- =============================================
-- (3) bulk_import_jobs — track upload + processing of CSV/XLSX
-- =============================================
-- admin يَرفع ملف → /api/admin/bulk-import/upload يُولِّد file_url + job
-- → server action يَقرأ الملف، يُحلِّل الصفوف، يَستدعي process_*_bulk_import RPC
-- → الـ RPC يَفعل: validate per row → if all valid: INSERT atomic → mark completed
-- → if any validation error: mark failed مع errors per row (no INSERT happens)
-- → if INSERT throws (race/constraint): rollback all + mark failed
-- =============================================
create table if not exists public.bulk_import_jobs (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  type text not null check (type in ('apartments', 'members')),
  file_url text not null,                                   -- مسار في bulk_import_uploads bucket
  file_name text,                                            -- لـ UI (اسم الملف الأصلي)
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  rows_total int,
  rows_succeeded int not null default 0,
  rows_failed int not null default 0,
  errors jsonb not null default '[]'::jsonb,                -- [{row: 1, error: "..."}, ...]
  failure_reason text,                                       -- رسالة عامة عند fail
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  -- constraints
  check (rows_total is null or rows_total >= 0),
  check (rows_succeeded >= 0 and rows_failed >= 0),
  check (status <> 'failed' or failure_reason is not null or jsonb_array_length(errors) > 0),
  check (status not in ('completed', 'failed', 'cancelled') or completed_at is not null)
);

create index if not exists idx_bulk_import_building
  on public.bulk_import_jobs (building_id, created_at desc);
create index if not exists idx_bulk_import_status
  on public.bulk_import_jobs (status, created_at desc) where status in ('pending', 'processing');

-- =============================================
-- (4) bulk_import_jobs trigger — immutability + transition whitelist
-- =============================================
create or replace function public.bulk_import_jobs_validate_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- audit + identity fields immutable
  if NEW.created_at is distinct from OLD.created_at
     or NEW.created_by is distinct from OLD.created_by
     or NEW.building_id is distinct from OLD.building_id
     or NEW.type is distinct from OLD.type
     or NEW.file_url is distinct from OLD.file_url
     or NEW.file_name is distinct from OLD.file_name then
    raise exception 'audit/identity fields are immutable on bulk_import_jobs'
      using errcode = 'check_violation';
  end if;

  -- transition whitelist
  if NEW.status is distinct from OLD.status then
    if not (
      (OLD.status = 'pending' and NEW.status in ('processing', 'cancelled'))
      or (OLD.status = 'processing' and NEW.status in ('completed', 'failed'))
    ) then
      raise exception 'invalid bulk_import_jobs transition: % -> %',
        OLD.status, NEW.status using errcode = 'check_violation';
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_bulk_import_jobs_validate_update on public.bulk_import_jobs;
create trigger trg_bulk_import_jobs_validate_update
  before update on public.bulk_import_jobs
  for each row
  execute function public.bulk_import_jobs_validate_update();

-- =============================================
-- (5) RLS — bulk_import_jobs — admin/super_admin SELECT only، no direct writes
-- =============================================
alter table public.bulk_import_jobs enable row level security;

drop policy if exists "bulk_jobs_select_member" on public.bulk_import_jobs;
create policy "bulk_jobs_select_member"
  on public.bulk_import_jobs for select
  to authenticated
  using (
    public.is_super_admin()
    or public.user_has_role(
      building_id, array['admin']::public.membership_role[]
    )
  );

-- لا INSERT/UPDATE/DELETE policies — كل writes عبر RPCs SECURITY DEFINER (lesson #31)

-- =============================================
-- (6) Storage bucket — bulk_import_uploads (private، deny-all anon)
-- =============================================
-- v0.19 design note: CSV only. The npm `xlsx` package has unpatched CVEs
-- (GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9) and the maintained version is
-- only on the SheetJS CDN (bypasses pnpm integrity). To preserve our
-- 0-vulnerabilities posture (lesson #27), we accept CSV only. The bucket's
-- mime whitelist enforces this — a malicious upload disguised with .csv
-- extension would still be filtered by content-type.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('bulk_import_uploads',
   'bulk_import_uploads',
   false,
   10485760,                                                 -- 10MB max
   array[
     'text/csv',
     'application/csv'
   ])
on conflict (id) do nothing;

-- لا policies على anon — bucket مُغلَق. uploads عبر /api/admin/bulk-import/upload
-- (server action + service_role client). الـ admin يَستطيع SELECT من DB لكن
-- الـ raw file مَحجوب — UI يَعرض signed URL مُولَّد server-side عند الحاجة.

-- =============================================
-- (7) subscription_reminders_sent — idempotency for the reminder cron
-- =============================================
-- لكل (building, days_before, subscription_ends_at) صف واحد كحد أقصى. التَكرار
-- لـ cron الذي يَعمل أكثر من مرة في اليوم يُرفض بـ unique constraint. على
-- renewal، الـ subscription_ends_at يَتغيَّر فيُعتبر period جديد ويُرسَل من جديد.
-- =============================================
create table if not exists public.subscription_reminders_sent (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  days_before int not null check (days_before in (30, 14, 7)),
  subscription_ends_at_snapshot timestamptz not null,
  sent_at timestamptz not null default now(),
  email_status text not null default 'queued'
    check (email_status in ('queued', 'sent', 'failed')),
  email_error text,
  unique (building_id, days_before, subscription_ends_at_snapshot)
);

create index if not exists idx_reminders_building
  on public.subscription_reminders_sent (building_id, sent_at desc);

-- RLS: super_admin only
alter table public.subscription_reminders_sent enable row level security;

drop policy if exists "reminders_select_super" on public.subscription_reminders_sent;
create policy "reminders_select_super"
  on public.subscription_reminders_sent for select
  to authenticated
  using (public.is_super_admin());

-- لا direct writes — الـ cron يَستدعي find_and_record_subscription_reminders RPC
-- التي تَفعل INSERT atomic مع SELECT.

-- =============================================
-- (8) RPCs — Phase 19 surface
-- =============================================

-- (8a) add_team_member — admin only (treasurer/committee/technician roles)
-- ========================================================================
-- لا يَدعم role='admin' أو 'resident' — الـ admin role له super-admin path،
-- وresident له apartment_members + join request flow (Phase 17).
-- ========================================================================
create or replace function public.add_team_member(
  p_building_id uuid,
  p_user_id uuid,
  p_role public.membership_role
) returns uuid                              -- membership id
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_existing record;
  v_id uuid;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = 'P0003';
  end if;
  if not public.user_has_role(
    p_building_id, array['admin']::public.membership_role[], v_caller
  ) then
    raise exception 'Access denied: admin only' using errcode = 'P0003';
  end if;
  if p_role not in ('treasurer', 'committee', 'technician') then
    raise exception 'role must be treasurer/committee/technician'
      using errcode = 'check_violation';
  end if;
  if p_user_id is null then
    raise exception 'p_user_id required' using errcode = 'check_violation';
  end if;

  -- Check existing membership in this building
  select * from public.building_memberships
  into v_existing
  where building_id = p_building_id and user_id = p_user_id
  for update;

  if found and v_existing.is_active then
    raise exception 'user already has active membership in this building'
      using errcode = 'unique_violation';
  end if;

  if found and not v_existing.is_active then
    -- reactivate with the new role
    update public.building_memberships
    set is_active = true,
        role = p_role,
        invited_by = v_caller
    where building_id = p_building_id and user_id = p_user_id
    returning id into v_id;
  else
    insert into public.building_memberships (
      building_id, user_id, role, is_active, invited_by
    ) values (
      p_building_id, p_user_id, p_role, true, v_caller
    )
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.add_team_member(uuid, uuid, public.membership_role) from public;
grant execute on function public.add_team_member(uuid, uuid, public.membership_role) to authenticated;

-- (8b) deactivate_team_member — admin only
-- =========================================
create or replace function public.deactivate_team_member(
  p_membership_id uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_membership record;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = 'P0003';
  end if;

  select * from public.building_memberships
  into v_membership
  where id = p_membership_id
  for update;

  if not found then
    raise exception 'membership not found' using errcode = 'P0002';
  end if;
  -- v0.19.1 (Codex round 2 P2 #3): /team only manages
  -- treasurer/committee/technician. resident memberships drive apartment
  -- access (apartment_members links + voting representative). Deactivating
  -- a resident's building_membership here would leave their apartment_members
  -- rows alive — an inconsistent access state. Resident removal must go
  -- through the apartment-member workflow (Phase 5 unlinkMember), which
  -- handles the apartment_members + voting-rep cleanup atomically.
  if v_membership.role not in ('treasurer', 'committee', 'technician') then
    raise exception
      'team RPC only manages treasurer/committee/technician (admin → super-admin path; resident → apartments unlink)'
      using errcode = 'P0003';
  end if;
  if not public.user_has_role(
    v_membership.building_id, array['admin']::public.membership_role[], v_caller
  ) then
    raise exception 'Access denied: admin only' using errcode = 'P0003';
  end if;
  if not v_membership.is_active then
    -- idempotent: already deactivated
    return;
  end if;

  update public.building_memberships
  set is_active = false
  where id = p_membership_id;
end;
$$;

revoke execute on function public.deactivate_team_member(uuid) from public;
grant execute on function public.deactivate_team_member(uuid) to authenticated;

-- (8c) create_renewal_order — building admin (rate-limited via server action)
-- ============================================================================
-- يُنشئ subscription_order بـ is_renewal=true. المُستدعي: building admin
-- (محقَّق عبر user_has_role). الـ token مَحسوب من server action ويُرسَل في email.
-- snapshot pricing من الـ tier الحالي + VAT من platform_settings.
-- ============================================================================
create or replace function public.create_renewal_order(
  p_building_id uuid,
  p_tier_id text,                                            -- new tier (or same for renewal-only)
  p_cycle text,
  p_token_hash text
) returns table (
  order_id uuid,
  reference_number text,
  total_amount numeric,
  currency text,
  is_plan_change boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_building record;
  v_tier record;
  v_vat_enabled boolean;
  v_vat_rate numeric;
  v_amount numeric(10,2);
  v_vat numeric(10,2);
  v_total numeric(10,2);
  v_ref text;
  v_id uuid;
  v_is_change boolean;
  v_admin_email text;
  v_admin_name text;
  v_admin_phone text;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = 'P0003';
  end if;
  if not public.user_has_role(
    p_building_id, array['admin']::public.membership_role[], v_caller
  ) then
    raise exception 'Access denied: building admin only' using errcode = 'P0003';
  end if;
  if p_cycle not in ('monthly', 'yearly') then
    raise exception 'invalid cycle' using errcode = 'check_violation';
  end if;
  if p_token_hash is null or length(p_token_hash) < 32 then
    raise exception 'invalid token hash' using errcode = 'check_violation';
  end if;

  -- Load building (lock row to prevent concurrent renewals)
  select id, name, city, subscription_plan, subscription_status, subscription_ends_at
  into v_building
  from public.buildings
  where id = p_building_id
  for update;

  if not found then
    raise exception 'building not found' using errcode = 'P0002';
  end if;
  -- v0.19.1 (Codex round 2 P1 #1): a new renewal cannot be opened while
  -- ANOTHER renewal slot is still alive for the same building. The Phase 18
  -- transition whitelist allows `rejected → awaiting_review` for re-uploads
  -- (when rejection_attempt_count < 3) — meaning a `rejected` order with
  -- attempts left can come BACK alive at any moment. If we let admin open
  -- order B while order A is in this re-uploadable rejected state, A's
  -- holder could re-upload, both could get approved, building gets
  -- double-extended.
  --
  -- Treat as in-flight: awaiting_payment, awaiting_review, provisioning,
  -- provisioning_failed, AND rejected-with-attempts-remaining. Only `expired`,
  -- `approved`, and `rejected@attempts>=3` (terminal) free the slot.
  if exists (
    select 1 from public.subscription_orders
    where renews_building_id = p_building_id
      and (
        status in ('awaiting_payment', 'awaiting_review', 'provisioning', 'provisioning_failed')
        or (status = 'rejected' and rejection_attempt_count < 3)
      )
  ) then
    raise exception 'a renewal order is already in flight for this building'
      using errcode = 'unique_violation';
  end if;

  -- Load tier
  select id, price_monthly, price_yearly, is_active
  into v_tier
  from public.subscription_tiers where id = p_tier_id;

  if not found or not v_tier.is_active then
    raise exception 'tier not available' using errcode = 'P0002';
  end if;
  if p_tier_id = 'trial' then
    raise exception 'cannot renew to trial tier' using errcode = 'check_violation';
  end if;

  if p_cycle = 'monthly' then
    if v_tier.price_monthly is null then
      raise exception 'tier has no monthly price' using errcode = 'check_violation';
    end if;
    v_amount := v_tier.price_monthly;
  else
    if v_tier.price_yearly is null then
      raise exception 'tier has no yearly price' using errcode = 'check_violation';
    end if;
    v_amount := v_tier.price_yearly;
  end if;

  -- VAT
  select (value::text)::boolean into v_vat_enabled
  from public.platform_settings where key = 'vat_enabled';
  v_vat_enabled := coalesce(v_vat_enabled, false);

  if v_vat_enabled then
    select (value::text)::numeric into v_vat_rate
    from public.platform_settings where key = 'vat_rate';
    v_vat_rate := coalesce(v_vat_rate, 0.15);
    v_vat := round(v_amount * v_vat_rate, 2);
  else
    v_vat := 0;
  end if;
  v_total := v_amount + v_vat;

  -- is_plan_change?
  v_is_change := (p_tier_id <> v_building.subscription_plan::text);

  -- Caller's profile snapshot for the order (email/name)
  select
    coalesce(u.email, ''),
    coalesce(p.full_name, u.email, ''),
    coalesce(p.phone, '')
  into v_admin_email, v_admin_name, v_admin_phone
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = v_caller;

  if v_admin_email = '' or v_admin_phone = '' then
    raise exception 'admin profile missing email/phone — fill profile first'
      using errcode = 'check_violation';
  end if;

  v_ref := public.next_subscription_reference();

  insert into public.subscription_orders (
    reference_number, access_token_hash,
    email, full_name, phone, building_name, city, estimated_apartments,
    tier_id, cycle, amount, vat_amount, total_amount,
    status,
    is_renewal, renews_building_id, is_plan_change, previous_tier_id
  ) values (
    v_ref, p_token_hash,
    v_admin_email, v_admin_name, v_admin_phone,
    v_building.name, v_building.city, null,
    p_tier_id, p_cycle, v_amount, v_vat, v_total,
    'awaiting_payment',
    true, p_building_id,
    v_is_change,
    case when v_is_change then v_building.subscription_plan::text else null end
  )
  returning id into v_id;

  return query select v_id, v_ref, v_total, 'SAR'::text, v_is_change;
end;
$$;

revoke execute on function public.create_renewal_order(uuid, text, text, text) from public;
grant execute on function public.create_renewal_order(uuid, text, text, text) to authenticated;

-- (8d) complete_renewal — super_admin only
-- =========================================
-- خلاف complete_provisioning، لا يُنشئ building/membership جديد. يُمدِّد
-- subscription_ends_at من max(now, current_ends_at) + cycle interval. لو
-- is_plan_change=true، يُحدِّث subscription_plan أيضاً (atomic).
-- =========================================
create or replace function public.complete_renewal(
  p_order_id uuid
) returns uuid                              -- the building_id (renewed)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order record;
  v_user_id uuid := auth.uid();
  v_building record;
  v_extension interval;
  v_new_ends_at timestamptz;
  v_target_status public.subscription_status;
  v_admin_user_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Access denied: super_admin only' using errcode = 'P0003';
  end if;

  select * from public.subscription_orders
  into v_order
  where id = p_order_id
  for update;

  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if not v_order.is_renewal or v_order.renews_building_id is null then
    raise exception 'order is not a renewal — use complete_provisioning'
      using errcode = 'P0003';
  end if;
  if v_order.status <> 'provisioning' then
    raise exception 'order in status % is not provisioning', v_order.status
      using errcode = 'P0003';
  end if;
  if v_order.reviewed_by is distinct from v_user_id then
    raise exception 'order reserved by a different super_admin'
      using errcode = 'P0003';
  end if;

  select * from public.buildings
  into v_building
  where id = v_order.renews_building_id
  for update;

  if not found then
    raise exception 'renewed building not found' using errcode = 'P0002';
  end if;

  -- Compute extension. Anchor from MAX(now, current ends_at) so early renewals
  -- don't lose unused contract time. Late renewals (after expiry) start from now.
  v_extension := case when v_order.cycle = 'monthly'
                      then interval '1 month'
                      else interval '1 year' end;
  v_new_ends_at := greatest(coalesce(v_building.subscription_ends_at, now()), now())
                   + v_extension;

  -- Target status: always 'active' after a successful renewal (the customer
  -- paid). Allowed transitions from any current state per Phase 14 trigger:
  --   active → active (no change, just extend ends_at — but trigger requires
  --     transition to actually be in whitelist if status changes; since we
  --     keep 'active', no transition validation triggers)
  --   past_due → active, expired → active, cancelled → active (all allowed)
  v_target_status := 'active';

  if v_order.is_plan_change then
    update public.buildings
    set subscription_plan = v_order.tier_id::public.subscription_plan,
        subscription_status = v_target_status,
        subscription_ends_at = v_new_ends_at
    where id = v_order.renews_building_id;
  else
    update public.buildings
    set subscription_status = v_target_status,
        subscription_ends_at = v_new_ends_at
    where id = v_order.renews_building_id;
  end if;

  -- Resolve the building's admin user_id (snapshot for provisioned_user_id —
  -- the Phase 18 CHECK requires it be set when status='approved'). Pick the
  -- earliest active admin (deterministic). Fall back to the approving
  -- super_admin if no admin exists (edge case — shouldn't happen for renewals).
  select bm.user_id into v_admin_user_id
  from public.building_memberships bm
  where bm.building_id = v_order.renews_building_id
    and bm.role = 'admin'
    and bm.is_active = true
  order by bm.created_at asc
  limit 1;

  if v_admin_user_id is null then
    v_admin_user_id := v_user_id;          -- fallback to super_admin
  end if;

  -- Mark order approved
  update public.subscription_orders
  set status = 'approved',
      provisioned_building_id = v_order.renews_building_id,
      provisioned_user_id = v_admin_user_id,
      reviewed_at = now(),
      provisioning_failure_reason = null
  where id = p_order_id;

  return v_order.renews_building_id;
end;
$$;

revoke execute on function public.complete_renewal(uuid) from public;
grant execute on function public.complete_renewal(uuid) to authenticated;

-- (8e) change_subscription_plan — super_admin direct override
-- ============================================================
-- لـ super_admin يَعمل مع العميل خارج الـ /subscribe flow (مكالمة، اتفاق
-- مُباشر). يُحدِّث subscription_plan + يُمدِّد ends_at اختيارياً. لا يُنشئ
-- order — هو override يدوي مَوثَّق في audit_logs (trigger يَلتقط).
-- ============================================================
create or replace function public.change_subscription_plan(
  p_building_id uuid,
  p_new_tier_id text,
  p_extend_cycle text,                       -- 'monthly'|'yearly'|null (لو null لا تَمديد)
  p_note text                                -- إلزامي — يُحفَظ في audit_logs
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_tier record;
  v_building record;
  v_new_ends_at timestamptz;
  v_old_plan public.subscription_plan;
  v_old_status public.subscription_status;
  v_old_ends_at timestamptz;
  v_new_plan public.subscription_plan;
  v_new_status public.subscription_status;
  v_new_ends_at_for_audit timestamptz;
begin
  if not public.is_super_admin() then
    raise exception 'Access denied: super_admin only' using errcode = 'P0003';
  end if;
  if p_note is null or length(p_note) < 5 or length(p_note) > 1000 then
    raise exception 'note required (5-1000 chars) for audit' using errcode = 'check_violation';
  end if;
  if p_extend_cycle is not null and p_extend_cycle not in ('monthly', 'yearly') then
    raise exception 'invalid extend_cycle' using errcode = 'check_violation';
  end if;

  select id, is_active from public.subscription_tiers
  into v_tier
  where id = p_new_tier_id;

  if not found or not v_tier.is_active then
    raise exception 'tier not available' using errcode = 'P0002';
  end if;

  select * from public.buildings into v_building
  where id = p_building_id for update;

  if not found then
    raise exception 'building not found' using errcode = 'P0002';
  end if;

  -- Snapshot OLD values BEFORE the UPDATE for audit
  v_old_plan := v_building.subscription_plan;
  v_old_status := v_building.subscription_status;
  v_old_ends_at := v_building.subscription_ends_at;

  if p_extend_cycle is not null then
    v_new_ends_at := greatest(coalesce(v_building.subscription_ends_at, now()), now())
                     + case when p_extend_cycle = 'monthly'
                            then interval '1 month'
                            else interval '1 year' end;
    v_new_status := case
      when v_old_status in ('expired', 'cancelled', 'past_due', 'trial')
      then 'active'::public.subscription_status
      else v_old_status
    end;
    update public.buildings
    set subscription_plan = p_new_tier_id::public.subscription_plan,
        subscription_ends_at = v_new_ends_at,
        subscription_status = v_new_status
    where id = p_building_id;
    v_new_plan := p_new_tier_id::public.subscription_plan;
    v_new_ends_at_for_audit := v_new_ends_at;
  else
    update public.buildings
    set subscription_plan = p_new_tier_id::public.subscription_plan
    where id = p_building_id;
    v_new_plan := p_new_tier_id::public.subscription_plan;
    v_new_status := v_old_status;
    v_new_ends_at_for_audit := v_old_ends_at;
  end if;

  -- v0.19.1 (Codex round 2 P2 #4): persist the audit trail. The buildings
  -- table has NO audit trigger (Phase 1 omitted it on purpose — most updates
  -- are routine like `name`/`address`). For the few writes that DO matter
  -- (super-admin override of plan/status/ends_at), we INSERT explicitly into
  -- audit_logs with old/new snapshots + the operator's note. Action label
  -- 'PLAN_CHANGE' makes the row easy to filter in /super-admin/audit.
  insert into public.audit_logs (
    building_id, actor_id, action, entity_type, entity_id,
    old_values, new_values, notes
  ) values (
    p_building_id,
    v_user_id,
    'PLAN_CHANGE',
    'buildings',
    p_building_id,
    jsonb_build_object(
      'subscription_plan', v_old_plan,
      'subscription_status', v_old_status,
      'subscription_ends_at', v_old_ends_at
    ),
    jsonb_build_object(
      'subscription_plan', v_new_plan,
      'subscription_status', v_new_status,
      'subscription_ends_at', v_new_ends_at_for_audit,
      'extend_cycle', p_extend_cycle
    ),
    p_note
  );
end;
$$;

revoke execute on function public.change_subscription_plan(uuid, text, text, text) from public;
grant execute on function public.change_subscription_plan(uuid, text, text, text) to authenticated;

-- (8f) create_bulk_import_job — admin only
-- =========================================
create or replace function public.create_bulk_import_job(
  p_building_id uuid,
  p_type text,
  p_file_url text,
  p_file_name text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_id uuid;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = 'P0003';
  end if;
  if not public.user_has_role(
    p_building_id, array['admin']::public.membership_role[], v_caller
  ) then
    raise exception 'Access denied: admin only' using errcode = 'P0003';
  end if;
  if p_type not in ('apartments', 'members') then
    raise exception 'invalid type' using errcode = 'check_violation';
  end if;
  if p_file_url is null or length(p_file_url) < 5 then
    raise exception 'invalid file_url' using errcode = 'check_violation';
  end if;

  insert into public.bulk_import_jobs (
    building_id, type, file_url, file_name, created_by
  ) values (
    p_building_id, p_type, p_file_url, nullif(p_file_name, ''), v_caller
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_bulk_import_job(uuid, text, text, text) from public;
grant execute on function public.create_bulk_import_job(uuid, text, text, text) to authenticated;

-- (8g) process_apartments_bulk_import — admin only، atomic
-- =========================================================
-- الـ caller (server action) يَستدعي بعد parsing الـ CSV/XLSX إلى jsonb array.
-- pattern:
--   1. Mark processing
--   2. Validate ALL rows (collect errors per row)
--   3. If any errors → mark failed، return errors، NO INSERTs
--   4. Else → INSERT all (in inner BEGIN with EXCEPTION للـ rollback atomic)
--   5. If INSERT succeeds → mark completed
--   6. If INSERT fails → mark failed مع reason، rollback all (atomicity)
-- =========================================================
create or replace function public.process_apartments_bulk_import(
  p_job_id uuid,
  p_rows jsonb                              -- [{number, floor, monthly_fee, status, notes}, ...]
) returns table (
  rows_succeeded int,
  rows_failed int,
  errors jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_job record;
  v_row jsonb;
  v_idx int := 0;
  v_total int;
  v_validation_errors jsonb := '[]'::jsonb;
  v_apartment_number text;
  v_floor int;
  v_monthly_fee numeric;
  v_status text;
  v_notes text;
  v_succeeded int := 0;
  v_failed int := 0;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = 'P0003';
  end if;

  select * from public.bulk_import_jobs into v_job
  where id = p_job_id for update;

  if not found then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
  if v_job.created_by <> v_caller then
    raise exception 'job belongs to another user' using errcode = 'P0003';
  end if;
  if v_job.type <> 'apartments' then
    raise exception 'job type mismatch (expected apartments)' using errcode = 'P0003';
  end if;
  if v_job.status <> 'pending' then
    raise exception 'job in status % is not pending', v_job.status
      using errcode = 'P0003';
  end if;
  if not public.user_has_role(
    v_job.building_id, array['admin']::public.membership_role[], v_caller
  ) then
    raise exception 'Access denied: admin only' using errcode = 'P0003';
  end if;

  v_total := jsonb_array_length(p_rows);
  if v_total < 1 then
    raise exception 'no rows to import' using errcode = 'check_violation';
  end if;
  if v_total > 1000 then
    raise exception 'too many rows (max 1000 per batch)' using errcode = 'check_violation';
  end if;

  -- Mark processing
  update public.bulk_import_jobs
  set status = 'processing', started_at = now(), rows_total = v_total
  where id = p_job_id;

  -- Validation phase (no DB writes)
  v_idx := 0;
  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_idx := v_idx + 1;
    v_apartment_number := nullif(trim(coalesce(v_row->>'number', '')), '');
    v_status := lower(coalesce(v_row->>'status', 'vacant'));

    if v_apartment_number is null then
      v_validation_errors := v_validation_errors || jsonb_build_object(
        'row', v_idx, 'error', 'apartment number missing'
      );
      v_failed := v_failed + 1;
      continue;
    end if;
    if length(v_apartment_number) > 30 then
      v_validation_errors := v_validation_errors || jsonb_build_object(
        'row', v_idx, 'error', 'apartment number too long (max 30 chars)'
      );
      v_failed := v_failed + 1;
      continue;
    end if;
    if v_status not in ('occupied', 'vacant', 'under_maintenance') then
      v_validation_errors := v_validation_errors || jsonb_build_object(
        'row', v_idx, 'error', 'invalid status (must be occupied/vacant/under_maintenance)'
      );
      v_failed := v_failed + 1;
      continue;
    end if;
    -- floor + monthly_fee numeric checks
    begin
      v_floor := nullif(v_row->>'floor', '')::int;
    exception when others then
      v_validation_errors := v_validation_errors || jsonb_build_object(
        'row', v_idx, 'error', 'floor must be integer'
      );
      v_failed := v_failed + 1;
      continue;
    end;
    begin
      v_monthly_fee := coalesce(nullif(v_row->>'monthly_fee', '')::numeric, 0);
    exception when others then
      v_validation_errors := v_validation_errors || jsonb_build_object(
        'row', v_idx, 'error', 'monthly_fee must be numeric'
      );
      v_failed := v_failed + 1;
      continue;
    end;
    if v_monthly_fee < 0 then
      v_validation_errors := v_validation_errors || jsonb_build_object(
        'row', v_idx, 'error', 'monthly_fee must be >= 0'
      );
      v_failed := v_failed + 1;
      continue;
    end if;
  end loop;

  if v_failed > 0 then
    update public.bulk_import_jobs
    set status = 'failed',
        completed_at = now(),
        rows_failed = v_failed,
        rows_succeeded = 0,
        errors = v_validation_errors,
        failure_reason = 'validation errors: ' || v_failed || ' / ' || v_total || ' rows'
    where id = p_job_id;
    return query select 0::int, v_failed, v_validation_errors;
    return;
  end if;

  -- Commit phase: INSERT all (atomic via inner BEGIN/EXCEPTION subtransaction)
  begin
    v_idx := 0;
    for v_row in select * from jsonb_array_elements(p_rows) loop
      v_idx := v_idx + 1;
      v_apartment_number := trim(v_row->>'number');
      v_floor := nullif(v_row->>'floor', '')::int;
      v_monthly_fee := coalesce(nullif(v_row->>'monthly_fee', '')::numeric, 0);
      v_status := lower(coalesce(v_row->>'status', 'vacant'));
      v_notes := nullif(trim(coalesce(v_row->>'notes', '')), '');

      insert into public.apartments (
        building_id, number, floor, monthly_fee, status, notes
      ) values (
        v_job.building_id, v_apartment_number, v_floor, v_monthly_fee,
        v_status::public.apartment_status, v_notes
      );
    end loop;

    update public.bulk_import_jobs
    set status = 'completed',
        completed_at = now(),
        rows_succeeded = v_total,
        rows_failed = 0,
        errors = '[]'::jsonb
    where id = p_job_id;
    return query select v_total, 0::int, '[]'::jsonb;
  exception when others then
    -- Rollback all INSERTs from the inner block + record failure
    update public.bulk_import_jobs
    set status = 'failed',
        completed_at = now(),
        rows_succeeded = 0,
        rows_failed = v_total,
        failure_reason = substring(sqlerrm from 1 for 500),
        errors = jsonb_build_array(jsonb_build_object(
          'row', v_idx,
          'error', sqlerrm
        ))
    where id = p_job_id;
    return query select 0::int, v_total, jsonb_build_array(jsonb_build_object(
      'row', v_idx, 'error', sqlerrm
    ));
  end;
end;
$$;

revoke execute on function public.process_apartments_bulk_import(uuid, jsonb) from public;
grant execute on function public.process_apartments_bulk_import(uuid, jsonb) to authenticated;

-- (8h) process_members_bulk_import — admin only، atomic
-- =====================================================
-- Members import: links existing apartments to existing users by email +
-- apartment number. Validates that user exists in auth.users and apartment
-- exists in the building. Atomic per Reserve/Complete pattern.
--
-- For users that don't exist yet: row marked failed with error message
-- ('user not found — invite via /team or join link first').
-- =====================================================
create or replace function public.process_members_bulk_import(
  p_job_id uuid,
  p_rows jsonb                              -- [{email, apartment_number, relation_type}, ...]
) returns table (
  rows_succeeded int,
  rows_failed int,
  errors jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_job record;
  v_row jsonb;
  v_idx int := 0;
  v_total int;
  v_validation_errors jsonb := '[]'::jsonb;
  v_email text;
  v_apt_number text;
  v_relation text;
  v_user_id uuid;
  v_apartment_id uuid;
  v_succeeded int := 0;
  v_failed int := 0;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = 'P0003';
  end if;

  select * from public.bulk_import_jobs into v_job
  where id = p_job_id for update;

  if not found then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
  if v_job.created_by <> v_caller then
    raise exception 'job belongs to another user' using errcode = 'P0003';
  end if;
  if v_job.type <> 'members' then
    raise exception 'job type mismatch (expected members)' using errcode = 'P0003';
  end if;
  if v_job.status <> 'pending' then
    raise exception 'job in status % is not pending', v_job.status
      using errcode = 'P0003';
  end if;
  if not public.user_has_role(
    v_job.building_id, array['admin']::public.membership_role[], v_caller
  ) then
    raise exception 'Access denied: admin only' using errcode = 'P0003';
  end if;

  v_total := jsonb_array_length(p_rows);
  if v_total < 1 then
    raise exception 'no rows to import' using errcode = 'check_violation';
  end if;
  if v_total > 1000 then
    raise exception 'too many rows (max 1000 per batch)' using errcode = 'check_violation';
  end if;

  update public.bulk_import_jobs
  set status = 'processing', started_at = now(), rows_total = v_total
  where id = p_job_id;

  -- Validation phase: collect errors per row
  v_idx := 0;
  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_idx := v_idx + 1;
    v_email := lower(nullif(trim(coalesce(v_row->>'email', '')), ''));
    v_apt_number := nullif(trim(coalesce(v_row->>'apartment_number', '')), '');
    v_relation := lower(coalesce(v_row->>'relation_type', 'resident'));

    if v_email is null or position('@' in v_email) = 0 then
      v_validation_errors := v_validation_errors || jsonb_build_object(
        'row', v_idx, 'error', 'invalid or missing email'
      );
      v_failed := v_failed + 1;
      continue;
    end if;
    if v_apt_number is null then
      v_validation_errors := v_validation_errors || jsonb_build_object(
        'row', v_idx, 'error', 'apartment_number missing'
      );
      v_failed := v_failed + 1;
      continue;
    end if;
    if v_relation not in ('owner', 'resident', 'representative') then
      v_validation_errors := v_validation_errors || jsonb_build_object(
        'row', v_idx, 'error', 'relation_type must be owner/resident/representative'
      );
      v_failed := v_failed + 1;
      continue;
    end if;

    -- Resolve user by email
    select id into v_user_id from auth.users where lower(email) = v_email limit 1;
    if v_user_id is null then
      v_validation_errors := v_validation_errors || jsonb_build_object(
        'row', v_idx, 'error', 'user not found in system — invite first'
      );
      v_failed := v_failed + 1;
      continue;
    end if;

    -- Resolve apartment in this building
    select id into v_apartment_id from public.apartments
    where building_id = v_job.building_id and number = v_apt_number
    limit 1;
    if v_apartment_id is null then
      v_validation_errors := v_validation_errors || jsonb_build_object(
        'row', v_idx, 'error', 'apartment not found in this building'
      );
      v_failed := v_failed + 1;
      continue;
    end if;
  end loop;

  if v_failed > 0 then
    update public.bulk_import_jobs
    set status = 'failed',
        completed_at = now(),
        rows_failed = v_failed,
        rows_succeeded = 0,
        errors = v_validation_errors,
        failure_reason = 'validation errors: ' || v_failed || ' / ' || v_total || ' rows'
    where id = p_job_id;
    return query select 0::int, v_failed, v_validation_errors;
    return;
  end if;

  -- Commit phase
  -- v0.19.1 (Codex round 2 P1 #2): mirror Phase 5 link_apartment_member's
  -- voting-rep semantics. The first active member of an apartment becomes
  -- its voting representative (unique partial index enforces one per
  -- apartment). Without this, bulk-imported apartments would have NO rep,
  -- breaking Phase 10 voting flows for the entire imported batch.
  -- We inline the logic instead of calling link_apartment_member because:
  --   (a) link_apartment_member's caller-permission check would re-validate
  --       and we already validated above
  --   (b) link_apartment_member doesn't do `on conflict do nothing` for the
  --       building_memberships INSERT path, but it has the same semantics
  --       (don't restore elevated role on reactivation — Phase 5 P1 lesson)
  declare
    v_existing_active_count int;
    v_mem_role public.membership_role;
    v_mem_active boolean;
  begin
    v_idx := 0;
    for v_row in select * from jsonb_array_elements(p_rows) loop
      v_idx := v_idx + 1;
      v_email := lower(trim(v_row->>'email'));
      v_apt_number := trim(v_row->>'apartment_number');
      v_relation := lower(coalesce(v_row->>'relation_type', 'resident'));

      select id into v_user_id from auth.users where lower(email) = v_email limit 1;
      select id into v_apartment_id from public.apartments
      where building_id = v_job.building_id and number = v_apt_number;

      -- ensure building_memberships row (Phase 5 semantics: never silently
      -- restore elevated role on reactivation — bulk import is a resident
      -- entry point only).
      select role, is_active into v_mem_role, v_mem_active
      from public.building_memberships
      where building_id = v_job.building_id and user_id = v_user_id;

      if not found then
        insert into public.building_memberships (
          building_id, user_id, role, is_active, invited_by
        ) values (
          v_job.building_id, v_user_id, 'resident', true, v_caller
        );
      elsif not v_mem_active then
        update public.building_memberships
          set is_active = true, role = 'resident'
          where building_id = v_job.building_id and user_id = v_user_id;
      end if;
      -- else: active row, preserve existing role (admin/treasurer/etc.)

      -- Count existing active apartment_members for this apartment to decide
      -- whether the new row should be the voting representative.
      select count(*)::int into v_existing_active_count
      from public.apartment_members
      where apartment_id = v_apartment_id
        and is_active = true;

      -- INSERT (no on-conflict skip — duplicate apartment_members rows in a
      -- bulk import are a data error; let the unique constraint fire so the
      -- outer EXCEPTION block rolls the whole transaction back. Atomicity
      -- beats silent skip per lesson #19/#37 — the admin should fix the CSV).
      insert into public.apartment_members (
        apartment_id, building_id, user_id, relation_type,
        is_active, is_voting_representative
      ) values (
        v_apartment_id, v_job.building_id, v_user_id,
        v_relation::public.apartment_relation, true,
        v_existing_active_count = 0  -- first active member becomes the rep
      );
    end loop;

    update public.bulk_import_jobs
    set status = 'completed',
        completed_at = now(),
        rows_succeeded = v_total,
        rows_failed = 0,
        errors = '[]'::jsonb
    where id = p_job_id;
    return query select v_total, 0::int, '[]'::jsonb;
  exception when others then
    update public.bulk_import_jobs
    set status = 'failed',
        completed_at = now(),
        rows_succeeded = 0,
        rows_failed = v_total,
        failure_reason = substring(sqlerrm from 1 for 500),
        errors = jsonb_build_array(jsonb_build_object('row', v_idx, 'error', sqlerrm))
    where id = p_job_id;
    return query select 0::int, v_total, jsonb_build_array(jsonb_build_object(
      'row', v_idx, 'error', sqlerrm
    ));
  end;
end;
$$;

revoke execute on function public.process_members_bulk_import(uuid, jsonb) from public;
grant execute on function public.process_members_bulk_import(uuid, jsonb) to authenticated;

-- (8i) cancel_bulk_import_job — admin or super_admin
-- ===================================================
create or replace function public.cancel_bulk_import_job(
  p_job_id uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_job record;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = 'P0003';
  end if;

  select * from public.bulk_import_jobs into v_job
  where id = p_job_id for update;

  if not found then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
  if v_job.status <> 'pending' then
    raise exception 'only pending jobs can be cancelled' using errcode = 'P0003';
  end if;

  if not (
    public.is_super_admin()
    or public.user_has_role(v_job.building_id, array['admin']::public.membership_role[], v_caller)
  ) then
    raise exception 'Access denied: admin/super_admin only' using errcode = 'P0003';
  end if;

  update public.bulk_import_jobs
  set status = 'cancelled', completed_at = now()
  where id = p_job_id;
end;
$$;

revoke execute on function public.cancel_bulk_import_job(uuid) from public;
grant execute on function public.cancel_bulk_import_job(uuid) to authenticated;

-- (8j) find_and_record_subscription_reminders — service_role (cron)
-- ==================================================================
-- يَجد kل building بـ subscription_ends_at قَريب من 30/14/7 يوماً وأَرسل إليه
-- email تَذكير. الـ INSERT في subscription_reminders_sent يَحدث atomically
-- مع الـ SELECT — الـ unique constraint على (building, days_before, ends_at)
-- يَمنع التَكرار حتى لو الـ cron عمل أكثر من مرة في اليوم.
--
-- يُرجع الصفوف المُسجَّلة (الـ caller — cron route — يُرسِل emails بناءً عليها).
-- ==================================================================
create or replace function public.find_and_record_subscription_reminders()
returns table (
  reminder_id uuid,
  building_id uuid,
  building_name text,
  admin_email text,
  admin_full_name text,
  days_before int,
  subscription_ends_at timestamptz,
  tier_id text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  return query
  with newly_inserted as (
    insert into public.subscription_reminders_sent as r0 (
      building_id, days_before, subscription_ends_at_snapshot, email_status
    )
    select b.id, d.n, b.subscription_ends_at, 'queued'
    from public.buildings b
    cross join (values (30), (14), (7)) as d(n)
    where b.subscription_status in ('active', 'trial')
      and b.subscription_ends_at is not null
      -- match by date window: ends_at falls on the target day (UTC date arithmetic)
      and b.subscription_ends_at::date = (current_date + (d.n || ' days')::interval)::date
      and not exists (
        select 1 from public.subscription_reminders_sent r
        where r.building_id = b.id
          and r.days_before = d.n
          and r.subscription_ends_at_snapshot = b.subscription_ends_at
      )
    on conflict (building_id, days_before, subscription_ends_at_snapshot) do nothing
    returning r0.id as ins_id, r0.building_id as ins_building_id,
              r0.days_before as ins_days_before,
              r0.subscription_ends_at_snapshot as ins_ends_at_snapshot
  )
  select n.ins_id,
         n.ins_building_id,
         b.name,
         u.email,
         coalesce(p.full_name, u.email),
         n.ins_days_before,
         n.ins_ends_at_snapshot,
         b.subscription_plan::text
  from newly_inserted n
  join public.buildings b on b.id = n.ins_building_id
  -- one admin per building (deterministic — earliest active admin)
  left join lateral (
    select bm.user_id from public.building_memberships bm
    where bm.building_id = n.ins_building_id
      and bm.role = 'admin'
      and bm.is_active = true
    order by bm.created_at asc
    limit 1
  ) admin_lat on true
  left join auth.users u on u.id = admin_lat.user_id
  left join public.profiles p on p.id = admin_lat.user_id;
end;
$$;

revoke execute on function public.find_and_record_subscription_reminders() from public;
grant execute on function public.find_and_record_subscription_reminders() to service_role;

-- (8k) update_reminder_email_status — service_role (cron post-send tracking)
-- =========================================================================
create or replace function public.update_reminder_email_status(
  p_reminder_id uuid,
  p_status text,
  p_error text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_status not in ('sent', 'failed') then
    raise exception 'invalid status' using errcode = 'check_violation';
  end if;
  update public.subscription_reminders_sent
  set email_status = p_status,
      email_error = case when p_status = 'failed' then p_error else null end
  where id = p_reminder_id;
end;
$$;

revoke execute on function public.update_reminder_email_status(uuid, text, text) from public;
grant execute on function public.update_reminder_email_status(uuid, text, text) to service_role;

-- End 20_phase19.sql
