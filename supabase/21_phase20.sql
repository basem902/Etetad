-- =============================================
-- 21_phase20.sql — Phase 20 (Operational refactor: /subscribe with password upfront)
-- =============================================
-- يطبَّق بعد 20_phase19.sql.
--
-- خَلفية:
--   Phase 18 الأصلي صَمَّم /subscribe كـ "payment-first" — العميل يَملأ النَموذج
--   بدون كلمة مرور، يُحَوِّل بنكياً، يَرفع إيصال، ثم super_admin يَعتمد ويُرسِل
--   invite via auth.admin.inviteUserByEmail. الـ user يَفتَح email الدعوة ويَضع
--   كلمة مرور عبر /forgot-password.
--
--   هذا يَعمل لكنه يَتطلَّب ثلاث خَطوات بريدية مُنفصلة (نَموذج + bank email +
--   invite email + password reset email) — مُربِك للعميل النِهائي.
--
--   نَموذج المالك: العميل يَختار كلمة المرور وقت التَسجيل، ثم يَنتظر موافَقة
--   super_admin، ثم يَدخل بنَفس الـ credentials. أَبسَط من ناحية UX.
--
-- التَغييرات:
--   1. create_subscription_order يَقبل p_user_id اختياري (NULL = legacy flow،
--      NOT NULL = pre-registered user من /subscribe بـ password)
--   2. RPC جَديدة get_my_pending_subscription_orders للـ authenticated users
--      ليَرى الـ pending orders الخاصة به في /account/pending
--   3. provisioned_user_id يَكتسب دلالة مَوسَّعة (راجع التَعليق على الـ column)
-- =============================================

-- =============================================
-- (1) Update create_subscription_order — accept optional p_user_id
-- =============================================
-- عند p_user_id != NULL: الـ order يَحفظ provisioned_user_id فوراً، لكن
-- status يَبقى awaiting_payment. هذا يَعني user_id مَعروف من البداية، فلا
-- نَحتاج auth.admin.inviteUserByEmail لاحقاً عند الاعتماد.
--
-- Phase 18 trigger: provisioned_user_id immutable once set — هذا يَتفق مع
-- النَمط الجَديد (مَعروف من البداية، لا يَتغيَّر).
-- Phase 18 CHECK: status='approved' ⇒ provisioned_user_id NOT NULL — يَبقى
-- مُحَقَّقاً (الآن مَعروف حتى قَبل الاعتماد).
-- =============================================

-- Drop the original 9-arg signature first. CREATE OR REPLACE with a different
-- signature creates a SECOND function (PostgreSQL function overloading by arity),
-- which causes "is not unique" errors when callers use 9 args.
drop function if exists public.create_subscription_order(
  text, text, text, text, text, int, text, text, text
);

create or replace function public.create_subscription_order(
  p_full_name text,
  p_email text,
  p_phone text,
  p_building_name text,
  p_city text,
  p_estimated_apartments int,
  p_tier_id text,
  p_cycle text,
  p_token_hash text,
  p_user_id uuid default null                  -- v0.20: pre-registered user
) returns table (
  order_id uuid,
  reference_number text,
  total_amount numeric,
  currency text
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

  -- v0.20: if p_user_id provided, verify the user exists in auth.users
  if p_user_id is not null then
    if not exists (select 1 from auth.users where id = p_user_id) then
      raise exception 'p_user_id does not match any auth.users row'
        using errcode = 'P0002';
    end if;
  end if;

  -- (2) load tier
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

  -- (3) compute VAT
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

  -- (4) generate reference + INSERT (with provisioned_user_id pre-set if user provided)
  v_ref := public.next_subscription_reference();

  insert into public.subscription_orders (
    reference_number, access_token_hash,
    email, full_name, phone, building_name, city, estimated_apartments,
    tier_id, cycle, amount, vat_amount, total_amount,
    status,
    provisioned_user_id                          -- v0.20: NULL for legacy, NOT NULL for new
  ) values (
    v_ref, p_token_hash,
    p_email, p_full_name, p_phone, p_building_name,
    nullif(p_city, ''), p_estimated_apartments,
    p_tier_id, p_cycle, v_amount, v_vat, v_total,
    'awaiting_payment',
    p_user_id
  )
  returning id into v_id;

  return query select v_id, v_ref, v_total, 'SAR'::text;
end;
$$;

-- Grant the new signature (with p_user_id default null) to service_role
revoke execute on function public.create_subscription_order(
  text, text, text, text, text, int, text, text, text, uuid
) from public;
grant execute on function public.create_subscription_order(
  text, text, text, text, text, int, text, text, text, uuid
) to service_role;

-- =============================================
-- (2) get_my_pending_subscription_orders — for /account/pending page
-- =============================================
-- Authenticated user reads their own pending subscription orders. Used by
-- /account/pending to show "your subscription is pending review" with the
-- reference number + status. RLS on subscription_orders is super_admin-only
-- for SELECT, so we need a SECURITY DEFINER RPC to scope by auth.uid().
-- =============================================
create or replace function public.get_my_pending_subscription_orders()
returns table (
  reference_number text,
  status text,
  building_name text,
  total_amount numeric,
  currency text,
  created_at timestamptz,
  is_renewal boolean,
  rejection_reason text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return;                                      -- empty result set, not an error
  end if;

  return query
  select
    o.reference_number, o.status, o.building_name,
    o.total_amount, o.currency, o.created_at,
    o.is_renewal, o.rejection_reason
  from public.subscription_orders o
  where o.provisioned_user_id = v_user_id
    and o.status in (
      'awaiting_payment', 'awaiting_review', 'provisioning',
      'provisioning_failed', 'rejected'
    )
  order by o.created_at desc;
end;
$$;

revoke execute on function public.get_my_pending_subscription_orders() from public;
grant execute on function public.get_my_pending_subscription_orders() to authenticated;

-- End 21_phase20.sql
