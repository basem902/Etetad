-- =============================================
-- 23_phase22.sql — Phase 22 (building metadata + role promotion + join floor)
-- =============================================
-- يطبَّق بعد 22_phase21.sql.
--
-- الإضافات حَسَب طَلب المالك:
--   A. عَدَد المَصاعد على buildings
--   B. حقل "الدور" (floor) في pending_apartment_members + submit_join_request
--   C. (تَغيير UI فقط، لا SQL) /join landing page benefits
--   D. change_member_role — admin يُرَقِّي ساكن إلى admin/treasurer/etc.
--      مَع الاحتفاظ بـ apartment_members
-- + RPC مُساعد لتَعديل metadata العمارة (elevators_count + total_apartments)
-- =============================================

-- =============================================
-- (A) elevators_count على buildings
-- =============================================
alter table public.buildings
  add column if not exists elevators_count int not null default 0;

-- Constraint sanity: 0..100 (نَطاق مَعقول)
do $$ begin
  alter table public.buildings
    add constraint chk_elevators_count
    check (elevators_count >= 0 and elevators_count <= 100);
exception when duplicate_object then null;
end $$;

-- =============================================
-- (B1) requested_floor على pending_apartment_members
-- =============================================
alter table public.pending_apartment_members
  add column if not exists requested_floor int;

do $$ begin
  alter table public.pending_apartment_members
    add constraint chk_requested_floor
    check (requested_floor is null or (requested_floor >= -5 and requested_floor <= 200));
exception when duplicate_object then null;
end $$;

-- =============================================
-- (B2) Update submit_join_request to accept p_floor
-- =============================================
drop function if exists public.submit_join_request(
  uuid, text, text, text, text
);

create or replace function public.submit_join_request(
  p_user_id uuid,
  p_token_hash text,
  p_full_name text,
  p_apartment_number text,
  p_phone text,
  p_floor int default null                   -- v0.22: floor for verification
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_link record;
  v_pending_id uuid;
begin
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
  if p_floor is not null and (p_floor < -5 or p_floor > 200) then
    raise exception 'invalid floor (must be -5..200)' using errcode = 'check_violation';
  end if;

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

  insert into public.pending_apartment_members
    (building_id, user_id, join_link_id,
     requested_apartment_number, requested_floor,
     full_name, phone, status)
  values
    (v_link.building_id, p_user_id, v_link.id,
     nullif(p_apartment_number, ''), p_floor,
     p_full_name, nullif(p_phone, ''), 'pending')
  returning id into v_pending_id;

  update public.building_join_links
  set uses_count = uses_count + 1
  where id = v_link.id;

  return v_pending_id;
end;
$$;

revoke execute on function public.submit_join_request(uuid, text, text, text, text, int)
  from public;
grant execute on function public.submit_join_request(uuid, text, text, text, text, int)
  to service_role;

-- =============================================
-- (D) change_member_role — admin promotes/demotes a member
-- =============================================
-- admin يَستطيع تَغيير دَور أي عُضو في عمارته (بما فيهم تَرقية ساكن إلى admin).
-- الـ apartment_members membership يَبقى — هذا تَغيير على building_memberships.role
-- فقط.
--
-- حماية:
--   - admin فقط يَستطيع التَغيير
--   - لا يُمكن إزالة آخر admin من العمارة (last-admin protection)
--   - الدور الجَديد يَجب أن يَكون valid
-- =============================================
create or replace function public.change_member_role(
  p_membership_id uuid,
  p_new_role public.membership_role
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_membership record;
  v_admin_count int;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = 'P0003';
  end if;

  select id, building_id, user_id, role, is_active
  from public.building_memberships
  into v_membership
  where id = p_membership_id
  for update;

  if not found then
    raise exception 'membership not found' using errcode = 'P0002';
  end if;
  if not v_membership.is_active then
    raise exception 'cannot change role of inactive membership'
      using errcode = 'P0003';
  end if;

  -- Caller must be admin of this building
  if not public.user_has_role(
    v_membership.building_id,
    array['admin']::public.membership_role[],
    v_caller
  ) then
    raise exception 'Access denied: building admin only'
      using errcode = 'P0003';
  end if;

  -- No-op when role unchanged
  if v_membership.role = p_new_role then
    return;
  end if;

  -- Last-admin protection: if demoting an admin, ensure another admin exists
  if v_membership.role = 'admin' and p_new_role <> 'admin' then
    select count(*) into v_admin_count
    from public.building_memberships
    where building_id = v_membership.building_id
      and role = 'admin'
      and is_active = true;
    if v_admin_count <= 1 then
      raise exception 'cannot demote the last admin (promote another member to admin first)'
        using errcode = 'P0003';
    end if;
  end if;

  update public.building_memberships
  set role = p_new_role
  where id = p_membership_id;
end;
$$;

revoke execute on function public.change_member_role(uuid, public.membership_role)
  from public;
grant execute on function public.change_member_role(uuid, public.membership_role)
  to authenticated;

-- =============================================
-- (E) update_building_metadata — admin edits building info
-- =============================================
-- admin يُحَدِّث: name, elevators_count, total_apartments, address, city,
-- default_monthly_fee. لا يُغَيِّر: subscription_*, created_*, currency.
-- =============================================
create or replace function public.update_building_metadata(
  p_building_id uuid,
  p_name text,
  p_address text,
  p_city text,
  p_total_apartments int,
  p_elevators_count int,
  p_default_monthly_fee numeric
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = 'P0003';
  end if;

  if not public.user_has_role(
    p_building_id, array['admin']::public.membership_role[], v_caller
  ) then
    raise exception 'Access denied: building admin only' using errcode = 'P0003';
  end if;

  if p_name is null or length(p_name) < 2 or length(p_name) > 200 then
    raise exception 'invalid building name' using errcode = 'check_violation';
  end if;
  if p_address is not null and length(p_address) > 500 then
    raise exception 'address too long' using errcode = 'check_violation';
  end if;
  if p_city is not null and length(p_city) > 80 then
    raise exception 'city too long' using errcode = 'check_violation';
  end if;
  if p_total_apartments < 0 or p_total_apartments > 10000 then
    raise exception 'invalid total_apartments' using errcode = 'check_violation';
  end if;
  if p_elevators_count < 0 or p_elevators_count > 100 then
    raise exception 'invalid elevators_count' using errcode = 'check_violation';
  end if;
  if p_default_monthly_fee < 0 then
    raise exception 'invalid default_monthly_fee' using errcode = 'check_violation';
  end if;

  update public.buildings
  set name = p_name,
      address = nullif(p_address, ''),
      city = nullif(p_city, ''),
      total_apartments = p_total_apartments,
      elevators_count = p_elevators_count,
      default_monthly_fee = p_default_monthly_fee,
      updated_at = now()
  where id = p_building_id;
end;
$$;

revoke execute on function public.update_building_metadata(
  uuid, text, text, text, int, int, numeric
) from public;
grant execute on function public.update_building_metadata(
  uuid, text, text, text, int, int, numeric
) to authenticated;

-- End 23_phase22.sql
