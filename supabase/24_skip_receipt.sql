-- ============================================================
-- 24_skip_receipt.sql — super_admin can approve/reject without
--                       requiring the customer to upload a receipt
-- ============================================================
-- Operator decision (post-RC1 smoke test): for solo-operator deployments,
-- super_admin should be able to mark an order paid and provision the
-- building without forcing the customer through the receipt upload step.
-- The receipt requirement was originally for trust between unfamiliar
-- parties — irrelevant when super_admin and the first few customers are
-- the same person.
--
-- Changes:
--   1. Transition whitelist: allow awaiting_payment → provisioning AND
--      awaiting_payment → rejected (was: only via awaiting_review).
--   2. reserve_subscription_order_for_provisioning: accept awaiting_payment.
--   3. reject_subscription_order: accept awaiting_payment.
--
-- Constraint preserved: awaiting_review still requires receipt_url
-- (line 86 of 19_phase18.sql). We just added a parallel path that skips
-- awaiting_review entirely.
-- ============================================================

begin;

-- (1) Transition validator: add awaiting_payment → {provisioning, rejected}
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
    raise exception 'order audit/snapshot fields are immutable'
      using errcode = 'check_violation';
  end if;
  if NEW.email is distinct from OLD.email
     or NEW.full_name is distinct from OLD.full_name
     or NEW.building_name is distinct from OLD.building_name
     or NEW.phone is distinct from OLD.phone then
    raise exception 'order identity snapshot fields are immutable'
      using errcode = 'check_violation';
  end if;

  -- transition whitelist (v0.23: super_admin can skip receipt step)
  if NEW.status is distinct from OLD.status then
    if not (
      -- payment received with receipt
      (OLD.status = 'awaiting_payment' and NEW.status in ('awaiting_review', 'expired'))
      -- super_admin direct action without receipt (NEW)
      or (OLD.status = 'awaiting_payment' and NEW.status in ('provisioning', 'rejected'))
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

-- Trigger already exists from 19_phase18.sql; replacing the function is enough.

-- (2) reserve_subscription_order_for_provisioning — accept awaiting_payment
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

  -- valid sources: awaiting_payment (skip-receipt) | awaiting_review (normal)
  --                | provisioning_failed (retry)
  -- + stale provisioning takeover (provisioning > 5 minutes since started)
  if v_order.status = 'provisioning' then
    if v_order.provisioning_started_at is not null
       and v_order.provisioning_started_at > (now() - interval '5 minutes') then
      raise exception 'order already being provisioned' using errcode = 'P0003';
    end if;
    -- stale lock — takeover allowed (audit log via this update)
  elsif v_order.status not in ('awaiting_payment', 'awaiting_review', 'provisioning_failed') then
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

-- (3) reject_subscription_order — accept awaiting_payment
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
  if v_order.status not in ('awaiting_payment', 'awaiting_review', 'provisioning_failed') then
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

commit;
