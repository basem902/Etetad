-- =============================================
-- 07_phase2.sql — Auth & Multi-Tenancy
-- =============================================
-- يطبَّق بعد ملفات المرحلة 1 (01→06).
-- يستبدل سياسة bootstrap بدالة atomic register_building().
-- =============================================

-- Drop the Phase 1 bootstrap policy — replaced by register_building() below.
-- (السياسة كانت تسمح للمستخدم بإنشاء أول admin membership لنفسه في عمارة أنشأها؛
--  الدالة الذرّية أنظف وتمنع race conditions.)
drop policy if exists "memberships_insert_self_admin_bootstrap" on public.building_memberships;

-- =============================================
-- register_building: atomic create-building + admin-membership
-- =============================================
-- Called by the registerBuilding server action after auth.signUp() succeeds.
-- SECURITY DEFINER so it can insert the admin membership for a user who
-- isn't yet a member of any building.
-- Returns the new building_id.
-- =============================================
create or replace function public.register_building(
  p_name text,
  p_address text default null,
  p_city text default null,
  p_default_monthly_fee numeric default 0,
  p_currency text default 'SAR'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_building_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'register_building: not authenticated';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'register_building: name is required';
  end if;

  insert into public.buildings (
    name, address, city, default_monthly_fee, currency, created_by
  ) values (
    trim(p_name),
    nullif(trim(coalesce(p_address, '')), ''),
    nullif(trim(coalesce(p_city, '')), ''),
    coalesce(p_default_monthly_fee, 0),
    coalesce(nullif(trim(coalesce(p_currency, '')), ''), 'SAR'),
    v_user_id
  )
  returning id into v_building_id;

  insert into public.building_memberships (building_id, user_id, role)
  values (v_building_id, v_user_id, 'admin');

  return v_building_id;
end;
$$;

grant execute on function public.register_building(text, text, text, numeric, text) to authenticated;

-- End 07_phase2.sql
