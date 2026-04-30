-- =============================================
-- 04_policies.sql — RLS Policies
-- =============================================
-- Pattern (per PLAN §2.3):
--   READs على بيانات العمارات: عبر RLS clauses تحوي `or is_super_admin()`
--   WRITEs على بيانات العمارات: نفس الشيء (super_admin يصلح الأخطاء عبر RLS)
--   service_role يُستخدم فقط لـ writes إدارية على المنصة في `(super-admin)/`
-- =============================================

-- Enable RLS on every table
alter table public.buildings enable row level security;
alter table public.profiles enable row level security;
alter table public.building_memberships enable row level security;
alter table public.apartments enable row level security;
alter table public.apartment_members enable row level security;
alter table public.vendors enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;
alter table public.maintenance_requests enable row level security;
alter table public.tasks enable row level security;
alter table public.suggestions enable row level security;
alter table public.votes enable row level security;
alter table public.vote_options enable row level security;
alter table public.vote_responses enable row level security;
alter table public.decisions enable row level security;
alter table public.documents enable row level security;
alter table public.audit_logs enable row level security;

-- =============================================
-- buildings
-- =============================================
create policy "buildings_select_member_or_super"
on public.buildings for select
using (public.is_building_member(id) or public.is_super_admin());

-- Authenticated users can register a new building (the building they create).
create policy "buildings_insert_authenticated"
on public.buildings for insert
to authenticated
with check (auth.uid() is not null);

create policy "buildings_update_admin_or_super"
on public.buildings for update
using (
  public.user_has_role(id, array['admin']::public.membership_role[])
  or public.is_super_admin()
)
with check (
  public.user_has_role(id, array['admin']::public.membership_role[])
  or public.is_super_admin()
);

-- No DELETE policy: buildings are not deleted from regular paths.
-- Super admin uses service_role from (super-admin)/ for hard delete if ever needed.

-- =============================================
-- profiles
-- =============================================
-- A user can see their own profile + profiles of co-members in any shared building.
-- Super admin sees all.
create policy "profiles_select_self_or_co_member"
on public.profiles for select
using (
  auth.uid() = id
  or public.is_super_admin()
  or exists (
    select 1
    from public.building_memberships m1
    inner join public.building_memberships m2 on m1.building_id = m2.building_id
    where m1.user_id = auth.uid()
      and m1.is_active = true
      and m2.user_id = profiles.id
      and m2.is_active = true
  )
);

create policy "profiles_update_self_or_super"
on public.profiles for update
using (auth.uid() = id or public.is_super_admin())
with check (auth.uid() = id or public.is_super_admin());

-- INSERT happens via trigger handle_new_user (SECURITY DEFINER bypasses RLS)
-- No DELETE policy

-- =============================================
-- building_memberships
-- =============================================
create policy "memberships_select_co_members"
on public.building_memberships for select
using (public.is_building_member(building_id) or public.is_super_admin());

-- Bootstrapping: a user can insert their OWN membership as 'admin' in a building they just created.
-- (Detected by: building.created_by = auth.uid() and no existing memberships for this building yet.)
-- Production code (Phase 2) will use a SECURITY DEFINER function for atomic registration.
create policy "memberships_insert_self_admin_bootstrap"
on public.building_memberships for insert
to authenticated
with check (
  user_id = auth.uid()
  and role = 'admin'::public.membership_role
  and exists (
    select 1 from public.buildings b
    where b.id = building_memberships.building_id
      and b.created_by = auth.uid()
  )
  and not exists (
    select 1 from public.building_memberships m2
    where m2.building_id = building_memberships.building_id
      and m2.id <> building_memberships.id
  )
);

-- Building admin manages other memberships
create policy "memberships_admin_manage"
on public.building_memberships for all
using (
  public.user_has_role(building_id, array['admin']::public.membership_role[])
  or public.is_super_admin()
)
with check (
  public.user_has_role(building_id, array['admin']::public.membership_role[])
  or public.is_super_admin()
);

-- =============================================
-- apartments
-- =============================================
create policy "apartments_select_members"
on public.apartments for select
using (public.is_building_member(building_id) or public.is_super_admin());

create policy "apartments_admin_manage"
on public.apartments for all
using (
  public.user_has_role(building_id, array['admin']::public.membership_role[])
  or public.is_super_admin()
)
with check (
  public.user_has_role(building_id, array['admin']::public.membership_role[])
  or public.is_super_admin()
);

-- =============================================
-- apartment_members
-- =============================================
create policy "apt_members_select"
on public.apartment_members for select
using (public.is_building_member(building_id) or public.is_super_admin());

create policy "apt_members_admin_manage"
on public.apartment_members for all
using (
  public.user_has_role(building_id, array['admin']::public.membership_role[])
  or public.is_super_admin()
)
with check (
  public.user_has_role(building_id, array['admin']::public.membership_role[])
  or public.is_super_admin()
);

-- =============================================
-- vendors
-- =============================================
create policy "vendors_select_members"
on public.vendors for select
using (public.is_building_member(building_id) or public.is_super_admin());

create policy "vendors_manage"
on public.vendors for all
using (
  public.user_has_role(
    building_id,
    array['admin', 'treasurer', 'committee']::public.membership_role[]
  )
  or public.is_super_admin()
)
with check (
  public.user_has_role(
    building_id,
    array['admin', 'treasurer', 'committee']::public.membership_role[]
  )
  or public.is_super_admin()
);

-- =============================================
-- payments
-- =============================================
-- READs: admin/treasurer/committee see all in building; resident sees own + apartment-linked
create policy "payments_select_admin_treasurer_committee"
on public.payments for select
using (
  public.user_has_role(
    building_id,
    array['admin', 'treasurer', 'committee']::public.membership_role[]
  )
  or public.is_super_admin()
);

create policy "payments_select_resident_own"
on public.payments for select
using (
  public.is_building_member(building_id) and (
    user_id = auth.uid()
    or created_by = auth.uid()
    or exists (
      select 1 from public.apartment_members am
      where am.apartment_id = payments.apartment_id
        and am.user_id = auth.uid()
        and am.is_active = true
    )
  )
);

-- INSERT: building member can insert (resident for own apartment; treasurer/admin for any)
create policy "payments_insert"
on public.payments for insert
to authenticated
with check (
  public.is_building_member(building_id)
  and (
    public.user_has_role(
      building_id,
      array['admin', 'treasurer']::public.membership_role[]
    )
    or exists (
      select 1 from public.apartment_members am
      where am.apartment_id = payments.apartment_id
        and am.user_id = auth.uid()
        and am.is_active = true
    )
  )
);

-- UPDATE: only treasurer/admin (or super_admin) can update (e.g., approve/reject)
create policy "payments_update_treasurer_admin"
on public.payments for update
using (
  public.user_has_role(
    building_id,
    array['admin', 'treasurer']::public.membership_role[]
  )
  or public.is_super_admin()
)
with check (
  public.user_has_role(
    building_id,
    array['admin', 'treasurer']::public.membership_role[]
  )
  or public.is_super_admin()
);

-- NO DELETE policy on payments (per §1.5.1 + §6.3)

-- =============================================
-- expenses
-- =============================================
create policy "expenses_select_members"
on public.expenses for select
using (public.is_building_member(building_id) or public.is_super_admin());

create policy "expenses_insert_treasurer_admin"
on public.expenses for insert
to authenticated
with check (
  public.user_has_role(
    building_id,
    array['admin', 'treasurer']::public.membership_role[]
  )
  or public.is_super_admin()
);

create policy "expenses_update_treasurer_admin"
on public.expenses for update
using (
  public.user_has_role(
    building_id,
    array['admin', 'treasurer']::public.membership_role[]
  )
  or public.is_super_admin()
)
with check (
  public.user_has_role(
    building_id,
    array['admin', 'treasurer']::public.membership_role[]
  )
  or public.is_super_admin()
);

-- NO DELETE policy on expenses (per §6.3)

-- =============================================
-- maintenance_requests
-- =============================================
-- SELECT: super_admin OR admin/committee/treasurer in building OR requester OR assignee (technician)
create policy "maint_select_relevant"
on public.maintenance_requests for select
using (
  public.is_super_admin()
  or public.user_has_role(
    building_id,
    array['admin', 'committee', 'treasurer']::public.membership_role[]
  )
  or requested_by = auth.uid()
  or assigned_to = auth.uid()
);

create policy "maint_insert_member"
on public.maintenance_requests for insert
to authenticated
with check (public.is_building_member(building_id));

-- UPDATE: admin/committee can edit fully; assigned technician can update (status/after_image only — enforced in server action)
create policy "maint_update"
on public.maintenance_requests for update
using (
  public.user_has_role(
    building_id,
    array['admin', 'committee']::public.membership_role[]
  )
  or assigned_to = auth.uid()
  or public.is_super_admin()
)
with check (
  public.user_has_role(
    building_id,
    array['admin', 'committee']::public.membership_role[]
  )
  or assigned_to = auth.uid()
  or public.is_super_admin()
);

-- =============================================
-- tasks
-- =============================================
create policy "tasks_select_relevant"
on public.tasks for select
using (
  public.is_super_admin()
  or public.user_has_role(
    building_id,
    array['admin', 'committee']::public.membership_role[]
  )
  or assigned_to = auth.uid()
  or created_by = auth.uid()
);

create policy "tasks_insert_admin_committee"
on public.tasks for insert
to authenticated
with check (
  public.user_has_role(
    building_id,
    array['admin', 'committee']::public.membership_role[]
  )
  or public.is_super_admin()
);

create policy "tasks_update_admin_or_assignee"
on public.tasks for update
using (
  public.user_has_role(
    building_id,
    array['admin', 'committee']::public.membership_role[]
  )
  or assigned_to = auth.uid()
  or public.is_super_admin()
)
with check (
  public.user_has_role(
    building_id,
    array['admin', 'committee']::public.membership_role[]
  )
  or assigned_to = auth.uid()
  or public.is_super_admin()
);

-- =============================================
-- suggestions
-- =============================================
create policy "suggestions_select_members"
on public.suggestions for select
using (public.is_building_member(building_id) or public.is_super_admin());

create policy "suggestions_insert_member"
on public.suggestions for insert
to authenticated
with check (public.is_building_member(building_id));

create policy "suggestions_update_author_or_admin"
on public.suggestions for update
using (
  created_by = auth.uid()
  or public.user_has_role(
    building_id,
    array['admin', 'committee']::public.membership_role[]
  )
  or public.is_super_admin()
)
with check (
  created_by = auth.uid()
  or public.user_has_role(
    building_id,
    array['admin', 'committee']::public.membership_role[]
  )
  or public.is_super_admin()
);

-- =============================================
-- votes
-- =============================================
create policy "votes_select_members"
on public.votes for select
using (public.is_building_member(building_id) or public.is_super_admin());

create policy "votes_admin_committee_manage"
on public.votes for all
using (
  public.user_has_role(
    building_id,
    array['admin', 'committee']::public.membership_role[]
  )
  or public.is_super_admin()
)
with check (
  public.user_has_role(
    building_id,
    array['admin', 'committee']::public.membership_role[]
  )
  or public.is_super_admin()
);

-- =============================================
-- vote_options (inherit from votes)
-- =============================================
create policy "vote_options_select"
on public.vote_options for select
using (
  exists (
    select 1 from public.votes v
    where v.id = vote_options.vote_id
      and (public.is_building_member(v.building_id) or public.is_super_admin())
  )
);

create policy "vote_options_admin_manage"
on public.vote_options for all
using (
  exists (
    select 1 from public.votes v
    where v.id = vote_options.vote_id
      and (
        public.user_has_role(
          v.building_id,
          array['admin', 'committee']::public.membership_role[]
        )
        or public.is_super_admin()
      )
  )
)
with check (
  exists (
    select 1 from public.votes v
    where v.id = vote_options.vote_id
      and (
        public.user_has_role(
          v.building_id,
          array['admin', 'committee']::public.membership_role[]
        )
        or public.is_super_admin()
      )
  )
);

-- =============================================
-- vote_responses
-- §1.5.2: only voting_representative of an apartment can cast a vote for that apartment
-- =============================================
create policy "vote_responses_select_members"
on public.vote_responses for select
using (
  exists (
    select 1 from public.votes v
    where v.id = vote_responses.vote_id
      and (public.is_building_member(v.building_id) or public.is_super_admin())
  )
);

-- INSERT: voter must satisfy:
--   1. user_id = auth.uid() (cannot vote on behalf of someone else)
--   2. The vote is in the same building as building_id (RLS check; FK in DB also enforces)
--   3. Member of that building
--   4. Vote is active and within window
--   5. Active voting_representative of the apartment (in the same building)
-- Tenant consistency is also enforced at DB level via composite FKs (closes Issue #1, #3).
create policy "vote_responses_insert_voting_rep"
on public.vote_responses for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.votes v
    where v.id = vote_responses.vote_id
      and v.building_id = vote_responses.building_id
      and public.is_building_member(v.building_id)
      and v.status = 'active'
      and now() between v.starts_at and v.ends_at
  )
  and exists (
    select 1 from public.apartment_members am
    where am.apartment_id = vote_responses.apartment_id
      and am.building_id = vote_responses.building_id
      and am.user_id = auth.uid()
      and am.is_voting_representative = true
      and am.is_active = true
  )
);

-- No UPDATE/DELETE on vote_responses (votes are immutable once cast)

-- =============================================
-- decisions
-- =============================================
create policy "decisions_select_members"
on public.decisions for select
using (public.is_building_member(building_id) or public.is_super_admin());

create policy "decisions_admin_committee_manage"
on public.decisions for all
using (
  public.user_has_role(
    building_id,
    array['admin', 'committee']::public.membership_role[]
  )
  or public.is_super_admin()
)
with check (
  public.user_has_role(
    building_id,
    array['admin', 'committee']::public.membership_role[]
  )
  or public.is_super_admin()
);

-- =============================================
-- documents
-- =============================================
create policy "documents_select_members"
on public.documents for select
using (
  (is_public = true and public.is_building_member(building_id))
  or public.user_has_role(
    building_id,
    array['admin', 'treasurer', 'committee']::public.membership_role[]
  )
  or public.is_super_admin()
);

create policy "documents_manage"
on public.documents for all
using (
  public.user_has_role(
    building_id,
    array['admin', 'treasurer', 'committee']::public.membership_role[]
  )
  or public.is_super_admin()
)
with check (
  public.user_has_role(
    building_id,
    array['admin', 'treasurer', 'committee']::public.membership_role[]
  )
  or public.is_super_admin()
);

-- =============================================
-- audit_logs
-- =============================================
create policy "audit_select_admin_committee"
on public.audit_logs for select
using (
  public.user_has_role(
    building_id,
    array['admin', 'committee']::public.membership_role[]
  )
  or public.is_super_admin()
);

-- INSERT happens ONLY via:
--   1. audit_changes() SECURITY DEFINER trigger (03_triggers.sql) — bypasses RLS
--      for INSERT/UPDATE/DELETE on sensitive tables (payments, expenses, etc.)
--   2. service_role direct insert from server-only routes (rare; bypasses RLS)
-- NO INSERT policy of any kind: authenticated clients cannot forge audit entries
-- via direct INSERT or via RPC (closes Issue #4 + Issue #6 from Codex review).

-- No UPDATE/DELETE policies — audit is immutable.

-- End 04_policies.sql
