-- =============================================
-- 02_functions.sql — Helper Functions for RLS
-- =============================================
-- All functions are SECURITY DEFINER to avoid recursion in RLS policies
-- (RLS-protected tables would otherwise be unreadable from within their own policies).
-- =============================================

-- =============================================
-- is_super_admin: returns true if user is the platform super admin
-- =============================================
create or replace function public.is_super_admin(user_uuid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_super_admin from public.profiles where id = user_uuid),
    false
  );
$$;

-- =============================================
-- is_building_member: returns true if user has an active membership in the building
-- =============================================
create or replace function public.is_building_member(
  bid uuid,
  user_uuid uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.building_memberships
    where building_id = bid
      and user_id = user_uuid
      and is_active = true
  );
$$;

-- =============================================
-- user_has_role: returns true if user has any of the given roles in the building
-- =============================================
create or replace function public.user_has_role(
  bid uuid,
  roles public.membership_role[],
  user_uuid uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.building_memberships
    where building_id = bid
      and user_id = user_uuid
      and role = any(roles)
      and is_active = true
  );
$$;

-- =============================================
-- user_building_ids: returns the set of building IDs the user is an active member of
-- =============================================
create or replace function public.user_building_ids(user_uuid uuid default auth.uid())
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select building_id from public.building_memberships
  where user_id = user_uuid
    and is_active = true;
$$;

-- =============================================
-- Grants — allow authenticated role to call helpers
-- =============================================
grant execute on function public.is_super_admin(uuid) to authenticated;
grant execute on function public.is_building_member(uuid, uuid) to authenticated;
grant execute on function public.user_has_role(uuid, public.membership_role[], uuid) to authenticated;
grant execute on function public.user_building_ids(uuid) to authenticated;

-- =============================================
-- Note on audit logging:
-- =============================================
-- Audit writes happen ONLY via:
--   1. audit_changes() SECURITY DEFINER trigger (03_triggers.sql) — auto on table mutations
--   2. service_role direct insert from server-only routes (rare; for non-table events)
--
-- A previous attempt at a public log_audit_event() RPC was removed because it would be
-- callable by any authenticated client (forging vector even with membership gating).
-- If a controlled non-table audit logger is needed in a later phase, design it as
-- service_role-only with explicit p_actor_id parameter, and DO NOT grant to authenticated.
-- =============================================

-- End 02_functions.sql
