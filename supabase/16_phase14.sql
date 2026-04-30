-- =============================================
-- 16_phase14.sql — Phase 14 (Super Admin + Subscriptions)
-- =============================================
-- يطبَّق بعد 15_phase12.sql.
-- يضيف حماية workflow على subscription transitions + SECURITY DEFINER RPCs
-- للـ super-admin dashboards. تطبيق وقائي لكل دروس Codex (13 درساً).
-- =============================================

-- =============================================
-- (1) Buildings — workflow integrity for subscription_status
-- =============================================
-- المشكلة المحتملة: admin عادي عبر RLS يَستطيع UPDATE buildings.subscription_status
-- (السياسة buildings_update_admin_or_super تَسمح للـ admin بالتحديث). الحل:
--   - subscription_status/plan تَتغيَّر فقط عبر SECURITY DEFINER RPC (super_admin only)
--   - الـ trigger يَمنع تعديل subscription fields عبر admin path
--   - الـ trigger يَفحص transition whitelist
-- =============================================

create or replace function public.buildings_validate_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  is_super boolean := public.is_super_admin();
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

  -- Only super_admin can change subscription state (Codex round 1 P1: tenant
  -- column protection). admin can edit name/address/etc. but NOT subscription.
  if not is_super then
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

  -- Transition whitelist (super_admin path):
  --   trial      -> active | expired | cancelled
  --   active     -> past_due | cancelled | expired
  --   past_due   -> active | cancelled | expired
  --   expired    -> active | trial      (super_admin can reactivate)
  --   cancelled  -> active | trial      (super_admin can reactivate)
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

drop trigger if exists trg_buildings_validate_update on public.buildings;
create trigger trg_buildings_validate_update
  before update on public.buildings
  for each row
  execute function public.buildings_validate_update();

-- =============================================
-- (2) Super-admin dashboard RPCs
-- =============================================

-- (2a) Platform-wide aggregate stats
create or replace function public.platform_stats()
returns table (
  total_buildings bigint,
  trial_buildings bigint,
  active_buildings bigint,
  expired_buildings bigint,
  cancelled_buildings bigint,
  total_users bigint,
  total_apartments bigint,
  total_payments_approved numeric,
  trials_expiring_soon bigint  -- within 7 days
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Access denied: super_admin only' using errcode = 'P0003';
  end if;

  return query
  select
    (select count(*)::bigint from public.buildings),
    (select count(*)::bigint from public.buildings where subscription_status = 'trial'),
    (select count(*)::bigint from public.buildings where subscription_status = 'active'),
    (select count(*)::bigint from public.buildings where subscription_status = 'expired'),
    (select count(*)::bigint from public.buildings where subscription_status = 'cancelled'),
    (select count(*)::bigint from public.profiles),
    (select count(*)::bigint from public.apartments),
    coalesce(
      (select sum(amount) from public.payments where status = 'approved'),
      0
    )::numeric,
    (select count(*)::bigint from public.buildings
     where subscription_status = 'trial'
       and trial_ends_at is not null
       and trial_ends_at < now() + interval '7 days'
       and trial_ends_at > now());
end;
$$;

grant execute on function public.platform_stats() to authenticated;

-- (2b) Update subscription — the only sanctioned write path
create or replace function public.update_building_subscription(
  p_building_id uuid,
  p_plan public.subscription_plan,
  p_status public.subscription_status,
  p_trial_ends_at timestamptz,
  p_subscription_ends_at timestamptz
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Access denied: super_admin only' using errcode = 'P0003';
  end if;

  -- Validate building exists
  if not exists (select 1 from public.buildings where id = p_building_id) then
    raise exception 'Building not found' using errcode = 'P0002';
  end if;

  update public.buildings
  set
    subscription_plan = p_plan,
    subscription_status = p_status,
    trial_ends_at = p_trial_ends_at,
    subscription_ends_at = p_subscription_ends_at
  where id = p_building_id;
  -- Trigger trg_buildings_validate_update (above) validates the transition.
end;
$$;

grant execute on function public.update_building_subscription(
  uuid, public.subscription_plan, public.subscription_status, timestamptz, timestamptz
) to authenticated;

-- (2c) Per-building usage detail (admin/treasurer load + counts)
create or replace function public.building_usage_detail(p_building_id uuid)
returns table (
  apartments_count bigint,
  members_count bigint,
  pending_payments_count bigint,
  approved_payments_total numeric,
  paid_expenses_total numeric,
  open_maintenance_count bigint,
  active_votes_count bigint,
  last_activity_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Access denied: super_admin only' using errcode = 'P0003';
  end if;

  return query
  select
    (select count(*)::bigint from public.apartments where building_id = p_building_id),
    (select count(*)::bigint from public.building_memberships where building_id = p_building_id and is_active = true),
    (select count(*)::bigint from public.payments where building_id = p_building_id and status = 'pending'),
    coalesce((select sum(amount) from public.payments where building_id = p_building_id and status = 'approved'), 0)::numeric,
    coalesce((select sum(amount) from public.expenses where building_id = p_building_id and status = 'paid'), 0)::numeric,
    (select count(*)::bigint from public.maintenance_requests where building_id = p_building_id and status not in ('completed', 'rejected')),
    (select count(*)::bigint from public.votes where building_id = p_building_id and status = 'active'),
    (select max(created_at) from public.audit_logs where building_id = p_building_id);
end;
$$;

grant execute on function public.building_usage_detail(uuid) to authenticated;

-- =============================================
-- (3) Block expired/cancelled buildings from member access
-- =============================================
-- المنطق: عضو في عمارة subscription_status='expired' أو 'cancelled' لا يَستطيع
-- الدخول. تطبيق:
--   - is_building_member() الموجودة من Phase 1 يَفحص العضوية فقط (is_active=true)
--   - نضيف helper جديدة is_building_active_subscription() تَفحص الاشتراك
--   - middleware يَستخدمها لـ active_building_id
--   - الـ RLS الحالية لا تُعدَّل (super_admin يَبقى يَرى للإصلاح)
-- =============================================

create or replace function public.is_building_active_subscription(p_building_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select subscription_status not in ('expired', 'cancelled')
      from public.buildings where id = p_building_id
    ),
    false
  );
$$;

grant execute on function public.is_building_active_subscription(uuid) to authenticated;

-- End 16_phase14.sql
