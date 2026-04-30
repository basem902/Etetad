-- =============================================
-- 08_phase5.sql — Apartments & Members helpers
-- =============================================
-- يطبَّق بعد 07_phase2.sql.
-- ثلاث دوال atomic لإدارة الشقق والـ voting representative:
--   - link_apartment_member        : ربط عضو، يُعيَّن أول عضو كـ voting rep تلقائياً
--   - change_voting_representative : تبديل الممثل ذرّياً (false للقديم، ثم true للجديد)
--   - deactivate_apartment_member  : إلغاء عضوية، يمنع إزالة الممثل دون بديل
-- =============================================

-- =============================================
-- link_apartment_member
-- =============================================
-- Inserts an apartment_member row. If this is the FIRST active member for the
-- apartment, it is auto-assigned as voting_representative (per §1.5.2).
-- Returns the new member id.
-- =============================================
create or replace function public.link_apartment_member(
  p_apartment_id uuid,
  p_user_id uuid,
  p_relation_type apartment_relation
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_building_id uuid;
  v_member_id uuid;
  v_existing_active int;
begin
  select building_id into v_building_id
  from public.apartments where id = p_apartment_id;
  if v_building_id is null then
    raise exception 'apartment not found';
  end if;

  if not (
    public.user_has_role(v_building_id, array['admin']::membership_role[])
    or public.is_super_admin()
  ) then
    raise exception 'access denied: only admin can link apartment members';
  end if;

  -- Ensure the user has an *active* building_membership before being linked
  -- to an apartment inside that building.
  --
  -- IMPORTANT (Codex P1): we must NOT silently restore a previously elevated
  -- role (admin/treasurer/committee) when reactivating a deactivated row.
  -- If a row exists but is inactive, we reactivate it forced to 'resident'.
  -- Re-granting elevated roles is reserved for an explicit admin flow.
  declare
    v_existing_role membership_role;
    v_existing_active boolean;
  begin
    select role, is_active into v_existing_role, v_existing_active
    from public.building_memberships
    where building_id = v_building_id and user_id = p_user_id;

    if not found then
      -- No membership: create as resident.
      insert into public.building_memberships (building_id, user_id, role)
      values (v_building_id, p_user_id, 'resident');
    elsif not v_existing_active then
      -- Inactive: reactivate AS RESIDENT (never restore elevated role implicitly).
      update public.building_memberships
        set is_active = true, role = 'resident'
        where building_id = v_building_id and user_id = p_user_id;
    end if;
    -- else (active row): keep as-is; preserves existing elevated active roles.
  end;

  select count(*)::int into v_existing_active
  from public.apartment_members
  where apartment_id = p_apartment_id
    and is_active = true;

  insert into public.apartment_members (
    building_id, apartment_id, user_id, relation_type, is_voting_representative
  ) values (
    v_building_id,
    p_apartment_id,
    p_user_id,
    p_relation_type,
    v_existing_active = 0  -- first active member becomes the rep
  )
  returning id into v_member_id;

  return v_member_id;
end;
$$;

grant execute on function public.link_apartment_member(uuid, uuid, apartment_relation)
  to authenticated;

-- =============================================
-- change_voting_representative
-- =============================================
-- Atomically switches the voting representative for an apartment:
-- step 1: clear the current rep (so the unique partial index is empty)
-- step 2: set the new rep
-- Both happen inside the function transaction; the audit_changes trigger on
-- apartment_members records both UPDATEs in audit_logs.
-- =============================================
create or replace function public.change_voting_representative(
  p_apartment_id uuid,
  p_new_member_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_building_id uuid;
begin
  select building_id into v_building_id
  from public.apartments where id = p_apartment_id;
  if v_building_id is null then
    raise exception 'apartment not found';
  end if;

  if not (
    public.user_has_role(v_building_id, array['admin']::membership_role[])
    or public.is_super_admin()
  ) then
    raise exception 'access denied: only admin can change voting representative';
  end if;

  if not exists (
    select 1 from public.apartment_members
    where id = p_new_member_id
      and apartment_id = p_apartment_id
      and is_active = true
  ) then
    raise exception 'replacement must be an active member of the same apartment';
  end if;

  -- Step 1: clear current rep (no-op if none exists yet).
  update public.apartment_members
    set is_voting_representative = false
    where apartment_id = p_apartment_id
      and is_voting_representative = true
      and is_active = true
      and id <> p_new_member_id;

  -- Step 2: set new rep.
  update public.apartment_members
    set is_voting_representative = true
    where id = p_new_member_id;
end;
$$;

grant execute on function public.change_voting_representative(uuid, uuid)
  to authenticated;

-- =============================================
-- deactivate_apartment_member
-- =============================================
-- Deactivates a member (sets is_active = false). If the member is the current
-- voting representative, the caller MUST supply a replacement member id (also
-- an active member of the same apartment); the swap happens atomically before
-- deactivation. Otherwise the function raises.
-- =============================================
create or replace function public.deactivate_apartment_member(
  p_member_id uuid,
  p_replacement_member_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_apartment_id uuid;
  v_building_id uuid;
  v_was_rep boolean;
begin
  select am.apartment_id, am.is_voting_representative, a.building_id
    into v_apartment_id, v_was_rep, v_building_id
  from public.apartment_members am
  join public.apartments a on a.id = am.apartment_id
  where am.id = p_member_id;

  if v_apartment_id is null then
    raise exception 'member not found';
  end if;

  if not (
    public.user_has_role(v_building_id, array['admin']::membership_role[])
    or public.is_super_admin()
  ) then
    raise exception 'access denied';
  end if;

  if v_was_rep then
    if p_replacement_member_id is null then
      raise exception 'cannot deactivate voting representative without specifying a replacement';
    end if;

    if p_replacement_member_id = p_member_id then
      raise exception 'replacement must be a different member';
    end if;

    if not exists (
      select 1 from public.apartment_members
      where id = p_replacement_member_id
        and apartment_id = v_apartment_id
        and is_active = true
    ) then
      raise exception 'replacement must be an active member of the same apartment';
    end if;

    -- Atomic swap, then deactivate.
    update public.apartment_members
      set is_voting_representative = false
      where id = p_member_id;

    update public.apartment_members
      set is_voting_representative = true
      where id = p_replacement_member_id;
  end if;

  update public.apartment_members
    set is_active = false
    where id = p_member_id;
end;
$$;

grant execute on function public.deactivate_apartment_member(uuid, uuid)
  to authenticated;

-- End 08_phase5.sql
