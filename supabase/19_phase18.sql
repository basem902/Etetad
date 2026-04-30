-- =============================================
-- 19_phase18.sql — Phase 18 (Bank-Transfer Subscription Orders + Provisioning)
-- =============================================
-- يطبَّق بعد 18_phase17.sql.
--
-- الهدف: تَمكين الزائر من الاشتراك ذاتياً عبر تَحويل بنكي يَدوي:
--   visitor → /subscribe → fill form → bank details + reference → transfer →
--   upload receipt → super_admin reviews → approve (atomic provisioning) →
--   admin invited → admin enters dashboard with onboarding wizard.
--
-- المبدأ المُحمَّل من Phase 16/17 (دروس #19، #28، #29، #31، #32):
--   1. لا direct table access — كل الـ writes عبر SECURITY DEFINER RPCs
--   2. tokens hashed (SHA-256)، الـ raw يَظهر مرة واحدة في URL
--   3. rate limit في server action layer (HTTP فقط — درس #20)
--   4. Reserve/Complete/Fail pattern للعمليات بـ side effects خارج DB (درس #19)
--   5. Storage RLS deny-all anon — uploads عبر API route + service_role
--   6. WRITES المُصرَّحة (super_admin) أيضاً تَمر عبر RPCs، لا direct table writes
-- =============================================

-- =============================================
-- (1) subscription_orders — الـ table الرئيسي
-- =============================================
create table if not exists public.subscription_orders (
  id uuid primary key default gen_random_uuid(),
  reference_number text unique not null,           -- SUB-2026-0042 (human-readable)

  -- access token (hashed، مع split counters من v3.28)
  access_token_hash text not null,                 -- SHA-256(raw_token)
  access_token_expires_at timestamptz not null
    default (now() + interval '30 days'),
  failed_access_attempts int not null default 0,   -- يَزداد عند فشل validation
  successful_access_count int not null default 0,  -- إحصائي/audit، لا يَقفل

  -- بيانات العميل
  email text not null,
  full_name text not null,
  phone text not null,
  building_name text not null,
  city text,
  estimated_apartments int,

  -- الباقة (snapshot — أسعار subscription_tiers قد تَتغيَّر لاحقاً، درس #11)
  tier_id text not null references public.subscription_tiers(id),
  cycle text not null check (cycle in ('monthly', 'yearly')),
  amount numeric(10,2) not null,                   -- snapshot، حُسبَ من tier
  vat_amount numeric(10,2) not null default 0,
  total_amount numeric(10,2) not null,
  currency text not null default 'SAR',

  -- التحويل البنكي
  receipt_url text,                                -- مسار في bucket subscription_receipts
  transfer_date date,
  transfer_reference text,                         -- رقم مرجع البنك (اختياري)

  -- workflow (v3.28: 7 حالات مع reserve/complete/fail pattern)
  status text not null default 'awaiting_payment'
    check (status in (
      'awaiting_payment',     -- order مُنشأ، بانتظار التحويل + رفع الإيصال
      'awaiting_review',      -- إيصال مرفوع، super_admin يُراجع
      'provisioning',         -- super_admin بدأ الاعتماد، order مَحجوز (lock)
      'approved',             -- provisioning نَجح
      'provisioning_failed',  -- invite أو RPC فشل بعد الحجز — recovery state
      'rejected',             -- مرفوض (مع سبب)
      'expired'               -- مَر 30 يوماً بلا تحويل (cron)
    )),
  rejection_reason text,
  rejection_attempt_count int not null default 0,  -- max 3 محاولات re-upload

  -- v3.28: Reserve/Complete/Fail tracking
  provisioning_started_at timestamptz,             -- لمنع stale locks (timeout 5 دقائق)
  provisioning_failure_reason text,

  -- نتيجة الـ provisioning
  provisioned_building_id uuid references public.buildings(id),
  provisioned_user_id uuid references auth.users(id),

  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),

  -- constraints
  check (status <> 'approved'
         or (provisioned_building_id is not null and provisioned_user_id is not null)),
  check (status <> 'rejected'
         or (rejection_reason is not null and length(rejection_reason) >= 3)),
  check (status <> 'awaiting_review' or receipt_url is not null),
  check (status <> 'provisioning' or provisioning_started_at is not null),
  check (status <> 'provisioning_failed' or provisioning_failure_reason is not null),
  check (rejection_attempt_count >= 0 and rejection_attempt_count <= 5),
  check (failed_access_attempts >= 0 and successful_access_count >= 0)
);

-- sequence للـ reference_number
create sequence if not exists public.subscription_order_seq start with 1;

-- function لتَوليد رقم مرجع: SUB-YYYY-NNNN
create or replace function public.next_subscription_reference()
returns text
language sql
volatile
as $$
  select 'SUB-' || extract(year from now())::text || '-'
         || lpad(nextval('subscription_order_seq')::text, 4, '0');
$$;

-- indexes
create index if not exists idx_orders_status_created
  on public.subscription_orders (status, created_at desc);
create index if not exists idx_orders_email
  on public.subscription_orders (email);
create index if not exists idx_orders_token_hash
  on public.subscription_orders (access_token_hash);

-- =============================================
-- (2) Storage bucket — subscription_receipts (private، deny-all anon)
-- =============================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('subscription_receipts',
   'subscription_receipts',
   false,
   5242880,                                    -- 5MB max
   array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- RLS على storage.objects للـ bucket: deny-all anon. كل uploads عبر API route
-- + service_role (درس #28). UI يَعرض الإيصال عبر signed URL مُولَّد server-side.
-- لا policies على anon → الـ bucket مُغلَق تماماً عبر الـ client.
-- service_role يَتجاوز RLS طبيعياً، فلا حاجة لـ policy.

-- =============================================
-- (3) Workflow trigger — transition whitelist + immutability
-- =============================================
-- - reference_number + tier_id + cycle + amount* + access_token_hash immutable
-- - email/full_name/building_name/phone immutable (snapshot من الـ submission)
-- - status transitions per whitelist
-- - stale provisioning lock (> 5 minutes) → super_admin آخر يَستطيع takeover
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

  -- transition whitelist
  if NEW.status is distinct from OLD.status then
    if not (
      -- payment received
      (OLD.status = 'awaiting_payment' and NEW.status in ('awaiting_review', 'expired'))
      -- review path
      or (OLD.status = 'awaiting_review' and NEW.status in ('provisioning', 'rejected'))
      -- provisioning outcomes
      or (OLD.status = 'provisioning' and NEW.status in ('approved', 'provisioning_failed'))
      -- recovery from failed provisioning
      or (OLD.status = 'provisioning_failed' and NEW.status in ('awaiting_review', 'rejected'))
      -- re-upload after rejection (within attempts limit)
      or (OLD.status = 'rejected' and NEW.status = 'awaiting_review')
    ) then
      raise exception 'invalid subscription_orders transition: % -> %',
        OLD.status, NEW.status using errcode = 'check_violation';
    end if;
  end if;

  -- provisioned_* immutable once set (no reassignment after approval)
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

drop trigger if exists trg_subscription_orders_validate_update on public.subscription_orders;
create trigger trg_subscription_orders_validate_update
  before update on public.subscription_orders
  for each row
  execute function public.subscription_orders_validate_update();

-- =============================================
-- (4) RLS — NO direct write policies (RPCs only، درس #28 + #31)
-- =============================================
alter table public.subscription_orders enable row level security;

-- SELECT: super_admin only (UI for /super-admin/orders).
-- anon لا يَرى الـ orders مباشرةً — يَستخدم validate_subscription_order_token RPC
-- الذي يُرجع subset مَحدود بعد token check.
drop policy if exists "orders_select_super" on public.subscription_orders;
create policy "orders_select_super"
  on public.subscription_orders for select
  to authenticated
  using (public.is_super_admin());

-- لا INSERT/UPDATE/DELETE policies — RPCs SECURITY DEFINER فقط (درس #31)
drop policy if exists "orders_insert_anon" on public.subscription_orders;
drop policy if exists "orders_update_super" on public.subscription_orders;
drop policy if exists "orders_delete_super" on public.subscription_orders;

-- =============================================
-- (5) RPCs (8) — public surface for /subscribe flow
-- =============================================

-- (5a) create_subscription_order — anon-callable (server action calls via admin client)
-- ====================================================================================
-- يُستدعى من createSubscriptionOrderAction. anon لكن GRANT يَبقى لـ service_role
-- لتَطبيق نمط درس #28 (rate limit في server action، RPC server-only).
--
-- يَحسب amount/vat/total من subscription_tiers + platform_settings.vat_*.
-- يُولِّد reference_number + raw access token + hash. الـ caller (server action)
-- يَستلم order_id + raw_token ويَرسل الـ token في URL/email.
-- ====================================================================================
create or replace function public.create_subscription_order(
  p_full_name text,
  p_email text,
  p_phone text,
  p_building_name text,
  p_city text,
  p_estimated_apartments int,
  p_tier_id text,
  p_cycle text,
  p_token_hash text                       -- raw token مَحسوب hash من server action
) returns table (
  order_id uuid,
  reference_number text,
  total_amount numeric,                   -- v3.39: returns snapshot للـ caller
  currency text                           -- (يَستخدمه email renderer للمبلغ الصحيح)
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tier record;
  v_vat_enabled boolean;
  v_vat_rate numeric;
  v_amount numeric(10,2);
  v_vat numeric(10,2);
  v_total numeric(10,2);
  v_ref text;
  v_id uuid;
begin
  -- (1) validate inputs (defense-in-depth — Zod في action هي layer 1)
  if p_full_name is null or length(p_full_name) < 2 or length(p_full_name) > 120 then
    raise exception 'invalid full_name' using errcode = 'check_violation';
  end if;
  if p_email is null
     or length(p_email) < 5 or length(p_email) > 254
     or position('@' in p_email) = 0 then
    raise exception 'invalid email' using errcode = 'check_violation';
  end if;
  if p_phone is null or length(p_phone) < 5 or length(p_phone) > 40 then
    raise exception 'invalid phone' using errcode = 'check_violation';
  end if;
  if p_building_name is null or length(p_building_name) < 2 or length(p_building_name) > 200 then
    raise exception 'invalid building_name' using errcode = 'check_violation';
  end if;
  if p_city is not null and length(p_city) > 80 then
    raise exception 'city too long' using errcode = 'check_violation';
  end if;
  if p_estimated_apartments is not null
     and (p_estimated_apartments <= 0 or p_estimated_apartments > 10000) then
    raise exception 'invalid apartments count' using errcode = 'check_violation';
  end if;
  if p_cycle not in ('monthly', 'yearly') then
    raise exception 'invalid cycle' using errcode = 'check_violation';
  end if;
  if p_token_hash is null or length(p_token_hash) < 32 then
    raise exception 'invalid token hash' using errcode = 'check_violation';
  end if;

  -- (2) load tier + verify it's active and has a price for the chosen cycle
  select id, price_monthly, price_yearly, is_active
  into v_tier
  from public.subscription_tiers where id = p_tier_id;

  if not found or not v_tier.is_active then
    raise exception 'tier not available' using errcode = 'P0002';
  end if;
  if p_tier_id = 'trial' then
    raise exception 'trial tier does not require payment' using errcode = 'check_violation';
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

  -- (3) compute VAT from platform_settings (read directly via SECURITY DEFINER)
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

  -- (4) generate reference + INSERT
  v_ref := public.next_subscription_reference();

  insert into public.subscription_orders (
    reference_number, access_token_hash,
    email, full_name, phone, building_name, city, estimated_apartments,
    tier_id, cycle, amount, vat_amount, total_amount,
    status
  ) values (
    v_ref, p_token_hash,
    p_email, p_full_name, p_phone, p_building_name,
    nullif(p_city, ''), p_estimated_apartments,
    p_tier_id, p_cycle, v_amount, v_vat, v_total,
    'awaiting_payment'
  )
  returning id into v_id;

  -- v3.39 (Codex P1): return snapshot total + currency so the server action
  -- can render the order_created email with the REAL amount (not 0). Without
  -- this, customer sees "transfer 0 SAR" in the bank-transfer instructions.
  return query select v_id, v_ref, v_total, 'SAR'::text;
end;
$$;

-- server-only via service_role (admin client يَستدعي من server action)
revoke execute on function public.create_subscription_order(
  text, text, text, text, text, int, text, text, text
) from public;
grant execute on function public.create_subscription_order(
  text, text, text, text, text, int, text, text, text
) to service_role;

-- (5b) validate_subscription_order_token — anon callable (split counter)
-- ======================================================================
-- v3.28 fix: failed_access_attempts يَزداد فقط عند فشل، successful_access_count
-- يَزداد عند نجاح. lock عند failed >= 5.
-- ======================================================================
create or replace function public.validate_subscription_order_token(
  p_order_id uuid,
  p_token_hash text                       -- مَحسوب من server action
) returns table (
  valid boolean,
  current_status text,
  error_code text
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_order record;
begin
  if p_order_id is null or p_token_hash is null or length(p_token_hash) < 32 then
    return query select false, null::text, 'invalid'::text;
    return;
  end if;

  select id, access_token_hash, access_token_expires_at,
         failed_access_attempts, status
  into v_order
  from public.subscription_orders
  where id = p_order_id
  for update;

  if not found then
    return query select false, null::text, 'invalid'::text;
    return;
  end if;

  -- lock check
  if v_order.failed_access_attempts >= 5 then
    return query select false, v_order.status, 'locked'::text;
    return;
  end if;

  -- expiry check
  if v_order.access_token_expires_at < now() then
    update public.subscription_orders
    set failed_access_attempts = failed_access_attempts + 1
    where id = p_order_id;
    return query select false, v_order.status, 'expired'::text;
    return;
  end if;

  -- hash check
  if v_order.access_token_hash <> p_token_hash then
    update public.subscription_orders
    set failed_access_attempts = failed_access_attempts + 1
    where id = p_order_id;
    return query select false, v_order.status, 'invalid'::text;
    return;
  end if;

  -- success: increment successful_access_count (لا يَقفل)
  update public.subscription_orders
  set successful_access_count = successful_access_count + 1
  where id = p_order_id;

  return query select true, v_order.status, null::text;
end;
$$;

grant execute on function public.validate_subscription_order_token(uuid, text)
  to anon, authenticated;

-- (5c) submit_subscription_receipt — service_role only
-- =====================================================
-- يُستدعى من API route /api/subscriptions/[order_id]/receipt بعد upload الملف
-- بـ service_role. الـ route يَتحقَّق من token أولاً ثم يَستدعي هذا الـ RPC.
-- =====================================================
create or replace function public.submit_subscription_receipt(
  p_order_id uuid,
  p_receipt_path text,                    -- المسار في bucket subscription_receipts
  p_transfer_date date,
  p_transfer_reference text               -- nullable
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order record;
begin
  if p_receipt_path is null or length(p_receipt_path) < 5 then
    raise exception 'invalid receipt_path' using errcode = 'check_violation';
  end if;
  if p_transfer_date is null then
    raise exception 'transfer_date required' using errcode = 'check_violation';
  end if;
  if p_transfer_date > current_date then
    raise exception 'transfer_date cannot be in the future' using errcode = 'check_violation';
  end if;

  select id, status, rejection_attempt_count
  from public.subscription_orders
  into v_order
  where id = p_order_id
  for update;

  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if v_order.status not in ('awaiting_payment', 'rejected') then
    raise exception 'order in status % cannot accept receipt', v_order.status
      using errcode = 'P0003';
  end if;
  -- v3.39 (Codex P2 defense-in-depth): cap re-uploads at 3 attempts
  if v_order.status = 'rejected' and v_order.rejection_attempt_count >= 3 then
    raise exception 'maximum re-upload attempts reached'
      using errcode = 'P0003';
  end if;

  update public.subscription_orders
  set receipt_url = p_receipt_path,
      transfer_date = p_transfer_date,
      transfer_reference = nullif(p_transfer_reference, ''),
      status = 'awaiting_review'
  where id = p_order_id;
end;
$$;

revoke execute on function public.submit_subscription_receipt(uuid, text, date, text)
  from public;
grant execute on function public.submit_subscription_receipt(uuid, text, date, text)
  to service_role;

-- (5d) reserve_subscription_order_for_provisioning — super_admin only
-- ====================================================================
-- خطوة 1 من Reserve/Complete pattern (درس #19). transitions awaiting_review →
-- provisioning مع SELECT FOR UPDATE atomic. يَحمي من race بين super_admins.
-- يَدعم stale lock takeover (provisioning > 5 minutes).
-- ====================================================================
create or replace function public.reserve_subscription_order_for_provisioning(
  p_order_id uuid
) returns table (
  reserved boolean,
  order_email text,
  order_full_name text,
  order_building_name text,
  order_city text,
  order_tier_id text,
  order_cycle text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order record;
  v_user_id uuid := auth.uid();
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

  -- valid sources: awaiting_review (normal) | provisioning_failed (retry)
  -- + stale provisioning takeover (provisioning > 5 minutes since started)
  if v_order.status = 'provisioning' then
    if v_order.provisioning_started_at is not null
       and v_order.provisioning_started_at > (now() - interval '5 minutes') then
      raise exception 'order already being provisioned' using errcode = 'P0003';
    end if;
    -- stale lock — takeover allowed (audit log via this update)
  elsif v_order.status not in ('awaiting_review', 'provisioning_failed') then
    raise exception 'order in status % cannot be reserved', v_order.status
      using errcode = 'P0003';
  end if;

  update public.subscription_orders
  set status = 'provisioning',
      provisioning_started_at = now(),
      reviewed_by = v_user_id
  where id = p_order_id;

  return query select
    true,
    v_order.email,
    v_order.full_name,
    v_order.building_name,
    v_order.city,
    v_order.tier_id,
    v_order.cycle;
end;
$$;

grant execute on function public.reserve_subscription_order_for_provisioning(uuid)
  to authenticated;

-- (5e) complete_provisioning — super_admin only
-- ==============================================
-- خطوة 3 (after invite). ATOMIC: INSERT building + INSERT membership + UPDATE
-- order to approved. لو فَشلت أي خطوة، الـ transaction يَتراجع كاملاً.
-- ==============================================
create or replace function public.complete_provisioning(
  p_order_id uuid,
  p_user_id uuid                          -- من auth.admin.inviteUserByEmail (server action)
) returns uuid                             -- يُرجع building_id الجديد
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order record;
  v_building_id uuid;
  v_user_id uuid := auth.uid();
  v_subscription_ends timestamptz;
begin
  if not public.is_super_admin() then
    raise exception 'Access denied: super_admin only' using errcode = 'P0003';
  end if;
  if p_user_id is null then
    raise exception 'p_user_id required' using errcode = 'check_violation';
  end if;

  select * from public.subscription_orders
  into v_order
  where id = p_order_id
  for update;

  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if v_order.status <> 'provisioning' then
    raise exception 'order in status % is not provisioning', v_order.status
      using errcode = 'P0003';
  end if;
  if v_order.reviewed_by <> v_user_id then
    raise exception 'order reserved by a different super_admin'
      using errcode = 'P0003';
  end if;

  -- compute subscription_ends_at based on cycle
  if v_order.cycle = 'monthly' then
    v_subscription_ends := now() + interval '1 month';
  else
    v_subscription_ends := now() + interval '1 year';
  end if;

  -- ATOMIC: INSERT building + INSERT membership
  insert into public.buildings (
    name, city, default_monthly_fee, currency,
    subscription_plan, subscription_status, subscription_ends_at,
    trial_ends_at, created_by
  ) values (
    v_order.building_name,
    v_order.city,
    0,                                   -- admin يَضبطها لاحقاً في onboarding
    'SAR',
    v_order.tier_id::public.subscription_plan,
    'active',
    v_subscription_ends,
    null,                                -- not in trial
    p_user_id
  )
  returning id into v_building_id;

  insert into public.building_memberships (
    building_id, user_id, role, is_active
  ) values (
    v_building_id, p_user_id, 'admin', true
  );

  -- mark order as approved
  update public.subscription_orders
  set status = 'approved',
      provisioned_building_id = v_building_id,
      provisioned_user_id = p_user_id,
      reviewed_at = now(),
      provisioning_failure_reason = null
  where id = p_order_id;

  return v_building_id;
end;
$$;

grant execute on function public.complete_provisioning(uuid, uuid) to authenticated;

-- (5f) mark_provisioning_failed — recovery path
-- ==============================================
-- v3.40 (Codex round 3 P2 #1): added ownership check. Without it, super_admin
-- B could disrupt super_admin A's in-flight provisioning by marking it failed
-- while A is still in invite/complete. Mirror complete_provisioning's check:
-- only the super_admin who reserved (reviewed_by) can mark failed — UNLESS
-- the lock is stale (provisioning_started_at > 5 min ago), in which case any
-- super_admin can take over (matches reserve's stale-takeover policy).
-- ==============================================
create or replace function public.mark_provisioning_failed(
  p_order_id uuid,
  p_failure_reason text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order record;
  v_user_id uuid := auth.uid();
begin
  if not public.is_super_admin() then
    raise exception 'Access denied: super_admin only' using errcode = 'P0003';
  end if;
  if p_failure_reason is null or length(p_failure_reason) < 3 then
    raise exception 'failure_reason required (≥ 3 chars)' using errcode = 'check_violation';
  end if;

  select id, status, reviewed_by, provisioning_started_at
  from public.subscription_orders
  into v_order
  where id = p_order_id
  for update;

  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if v_order.status <> 'provisioning' then
    raise exception 'order is not provisioning' using errcode = 'P0003';
  end if;

  -- ownership check (v3.40): only the super_admin who reserved can mark
  -- failed, unless the lock is stale (>5 min — matches reserve takeover).
  if v_order.reviewed_by is distinct from v_user_id then
    if v_order.provisioning_started_at is null
       or v_order.provisioning_started_at > (now() - interval '5 minutes') then
      raise exception 'order reserved by a different super_admin'
        using errcode = 'P0003';
    end if;
    -- stale lock: takeover allowed
  end if;

  update public.subscription_orders
  set status = 'provisioning_failed',
      provisioning_failure_reason = substring(p_failure_reason from 1 for 500),
      reviewed_at = now()
  where id = p_order_id;
end;
$$;

grant execute on function public.mark_provisioning_failed(uuid, text) to authenticated;

-- (5g) reset_failed_provisioning — super_admin retry
-- ===================================================
create or replace function public.reset_failed_provisioning(
  p_order_id uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  if not public.is_super_admin() then
    raise exception 'Access denied: super_admin only' using errcode = 'P0003';
  end if;

  select status into v_status from public.subscription_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if v_status <> 'provisioning_failed' then
    raise exception 'order is not in provisioning_failed' using errcode = 'P0003';
  end if;

  update public.subscription_orders
  set status = 'awaiting_review',
      provisioning_started_at = null,
      provisioning_failure_reason = null,
      reviewed_by = null
  where id = p_order_id;
end;
$$;

grant execute on function public.reset_failed_provisioning(uuid) to authenticated;

-- (5h) reject_subscription_order — super_admin only
-- ==================================================
create or replace function public.reject_subscription_order(
  p_order_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order record;
  v_user_id uuid := auth.uid();
begin
  if not public.is_super_admin() then
    raise exception 'Access denied: super_admin only' using errcode = 'P0003';
  end if;
  if p_reason is null or length(p_reason) < 3 or length(p_reason) > 500 then
    raise exception 'rejection_reason must be 3-500 chars' using errcode = 'check_violation';
  end if;

  select id, status, rejection_attempt_count
  from public.subscription_orders
  into v_order
  where id = p_order_id
  for update;

  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if v_order.status not in ('awaiting_review', 'provisioning_failed') then
    raise exception 'order in status % cannot be rejected', v_order.status
      using errcode = 'P0003';
  end if;

  update public.subscription_orders
  set status = 'rejected',
      rejection_reason = p_reason,
      rejection_attempt_count = rejection_attempt_count + 1,
      reviewed_by = v_user_id,
      reviewed_at = now()
  where id = p_order_id;
end;
$$;

grant execute on function public.reject_subscription_order(uuid, text) to authenticated;

-- (5i) get_order_for_receipt_page — anon callable, returns subset
-- ================================================================
-- /subscribe/[id] page calls this after validate_subscription_order_token
-- succeeds. Returns the order's display data + bank details bundled (so we
-- don't expand get_public_bank_details to anon; this RPC validates the token
-- itself before returning).
-- ================================================================
create or replace function public.get_order_for_receipt_page(
  p_order_id uuid,
  p_token_hash text
) returns table (
  order_id uuid,
  reference_number text,
  status text,
  amount numeric,
  vat_amount numeric,
  total_amount numeric,
  currency text,
  building_name text,
  rejection_reason text,
  rejection_attempt_count int,
  bank_account jsonb
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_validation record;
  v_order record;
  v_bank jsonb;
begin
  -- gate via the same validation RPC (counter increment included)
  select * from public.validate_subscription_order_token(p_order_id, p_token_hash)
  into v_validation;

  if not v_validation.valid then
    -- Don't leak any data on invalid token
    raise exception 'invalid token: %', coalesce(v_validation.error_code, 'invalid')
      using errcode = 'P0003';
  end if;

  select o.reference_number, o.status, o.amount, o.vat_amount, o.total_amount,
         o.currency, o.building_name, o.rejection_reason, o.rejection_attempt_count
  into v_order
  from public.subscription_orders o where o.id = p_order_id;

  -- bank details from platform_settings (this RPC bypasses RLS via DEFINER,
  -- but we ONLY return them after token validation — same trust gate)
  select value into v_bank from public.platform_settings where key = 'bank_account';

  return query select
    p_order_id as order_id,
    v_order.reference_number::text,
    v_order.status::text,
    v_order.amount::numeric,
    v_order.vat_amount::numeric,
    v_order.total_amount::numeric,
    v_order.currency::text,
    v_order.building_name::text,
    v_order.rejection_reason::text,
    v_order.rejection_attempt_count::int,
    v_bank;
end;
$$;

grant execute on function public.get_order_for_receipt_page(uuid, text) to anon, authenticated;

-- =============================================
-- (6) Cron expiry — narrow RPC + private marker (v3.40 redesign)
-- =============================================
-- Codex round 3 P2 #2: the previous v3.38 amendment allowed ANY
-- session_user='service_role' to bypass super_admin gating for ALL
-- subscription_* fields. Too broad — `createAdminClient()` is used in
-- multiple paths (auth-admin invites, contact_request RPC, etc.) and any
-- bug in those paths would silently bypass `update_building_subscription`.
--
-- Replace with the unforgeable marker pattern (Phase 8 lesson #6):
--   - private.cron_subscription_expiry_marker — only writable by SECURITY
--     DEFINER RPC `expire_due_subscriptions()`.
--   - The marker is tied to txid_current(), so it cannot be set in another
--     transaction and reused.
--   - Trigger checks for the marker IN THE SAME TXID, not session_user.
--   - Only `expire_due_subscriptions()` (server-only, GRANT to service_role
--     via cron) inserts the marker.
--
-- Codex round 3 P2 #3: also preserve `subscription_ends_at` (the contractual
-- end date). The previous cron set it to now() on expiry, destroying the
-- audit trail. The narrow RPC only flips `subscription_status`.
--
-- Codex round 4 P2 (v3.41): the marker bypass is tightened to the exact
-- `active → expired` transition where `OLD.subscription_ends_at < now()`.
-- The general transition whitelist also permits `active → cancelled` and
-- `expired → active`; without the clamp, those would ride the bypass too if
-- any UPDATE shared the cron RPC's txid. The clamp confines the marker to
-- one single-purpose path: bulk-flip of truly-due rows.
-- =============================================

-- (6a) Private marker — unforgeable bypass token for the cron path
create schema if not exists private;
create table if not exists private.cron_subscription_expiry_marker (
  txid bigint primary key,
  created_at timestamptz not null default now()
);
revoke all on private.cron_subscription_expiry_marker from public;
revoke all on private.cron_subscription_expiry_marker from authenticated;
revoke all on private.cron_subscription_expiry_marker from anon;
revoke all on schema private from public, authenticated, anon;
-- Only SECURITY DEFINER functions (running as their owner) can write here.

-- (6b) Restore the Phase 14 trigger to its v3.30 shape, but with marker check
create or replace function public.buildings_validate_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  is_super boolean := public.is_super_admin();
  -- v3.40: narrow bypass via private marker (replaces broad session_user check)
  is_cron_expiry boolean := exists (
    select 1 from private.cron_subscription_expiry_marker
    where txid = txid_current()
  );
begin
  -- created_at / created_by audit fields immutable (Phase 8 lesson)
  if NEW.created_at is distinct from OLD.created_at then
    raise exception 'created_at is immutable on buildings'
      using errcode = 'check_violation';
  end if;
  if NEW.created_by is distinct from OLD.created_by then
    raise exception 'created_by is immutable on buildings'
      using errcode = 'check_violation';
  end if;

  -- subscription state changes via:
  --   1. super_admin (UI path)
  --   2. cron expiry RPC (private marker = unforgeable proof)
  if not is_super and not is_cron_expiry then
    if NEW.subscription_plan      is distinct from OLD.subscription_plan
       or NEW.subscription_status is distinct from OLD.subscription_status
       or NEW.trial_ends_at       is distinct from OLD.trial_ends_at
       or NEW.subscription_ends_at is distinct from OLD.subscription_ends_at
    then
      raise exception
        'Subscription fields can only be changed by super_admin (use the super-admin RPC)'
        using errcode = 'check_violation';
    end if;
  end if;

  -- v3.40: When the cron path is used, ONLY subscription_status may change.
  -- This prevents a misuse-by-mistake where the cron updates other fields.
  if is_cron_expiry and not is_super then
    if NEW.subscription_plan      is distinct from OLD.subscription_plan
       or NEW.trial_ends_at       is distinct from OLD.trial_ends_at
       or NEW.subscription_ends_at is distinct from OLD.subscription_ends_at
    then
      raise exception 'cron expiry path may only change subscription_status'
        using errcode = 'check_violation';
    end if;

    -- v3.41 (Codex round 4 P2): tighten further. The general transition
    -- whitelist (below) allows several transitions out of 'active' and into
    -- 'active'/'trial' from terminal states. Without this clamp, the marker
    -- would also legalize them — any UPDATE in the same txid as the cron
    -- RPC could ride the bypass to do `active→cancelled` or `expired→active`
    -- so long as no other field changes. The marker is single-purpose: a
    -- bulk-flip of due rows, where the row's contractual end-date has truly
    -- passed. Enforce that exactly:
    --   OLD.status='active', NEW.status='expired', OLD.ends_at IS NOT NULL
    --   AND OLD.ends_at < now()
    if OLD.subscription_status is distinct from 'active'
       or NEW.subscription_status is distinct from 'expired'
       or OLD.subscription_ends_at is null
       or OLD.subscription_ends_at >= now() then
      raise exception
        'cron expiry marker may only flip active→expired on rows whose subscription_ends_at has passed'
        using errcode = 'check_violation';
    end if;
  end if;

  -- Transition whitelist applies regardless of the bypass path.
  if NEW.subscription_status is distinct from OLD.subscription_status then
    if not (
      (OLD.subscription_status = 'trial'    and NEW.subscription_status in ('active', 'expired', 'cancelled'))
      or (OLD.subscription_status = 'active'   and NEW.subscription_status in ('past_due', 'cancelled', 'expired'))
      or (OLD.subscription_status = 'past_due' and NEW.subscription_status in ('active', 'cancelled', 'expired'))
      or (OLD.subscription_status = 'expired'  and NEW.subscription_status in ('active', 'trial'))
      or (OLD.subscription_status = 'cancelled' and NEW.subscription_status in ('active', 'trial'))
    ) then
      raise exception 'Invalid subscription_status transition: % -> %',
        OLD.subscription_status, NEW.subscription_status
        using errcode = 'check_violation';
    end if;
  end if;

  return NEW;
end;
$$;

-- (trigger itself is unchanged — already attached in 16_phase14.sql)

-- (6c) Narrow cron RPC — replaces direct service_role UPDATE
-- =========================================================
-- Bulk-flips active buildings whose subscription_ends_at < now to expired.
-- Preserves subscription_ends_at (the original contractual date).
--
-- The marker INSERT happens FIRST in the same transaction, then the bulk
-- UPDATE — the trigger sees the marker and allows. After the function
-- returns, the marker row is still there (cleanup not needed: it's tied
-- to the txid which can't be reused).
--
-- Returns the number of expired buildings (cron logs this).
-- =========================================================
create or replace function public.expire_due_subscriptions()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  -- Insert the unforgeable marker for the trigger
  insert into private.cron_subscription_expiry_marker (txid)
  values (txid_current())
  on conflict (txid) do nothing;

  -- Bulk flip active buildings whose contractual end date has passed.
  -- subscription_ends_at is NOT updated — preserves audit trail.
  update public.buildings
  set subscription_status = 'expired'
  where subscription_status = 'active'
    and subscription_ends_at is not null
    and subscription_ends_at < now();
  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

revoke execute on function public.expire_due_subscriptions() from public;
grant execute on function public.expire_due_subscriptions() to service_role;

-- End 19_phase18.sql
