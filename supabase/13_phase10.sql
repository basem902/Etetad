-- =============================================
-- 13_phase10.sql — Phase 10 (Governance: Suggestions + Votes + Decisions)
-- =============================================
-- يطبَّق بعد 12_phase9.sql.
-- يضيف workflow integrity كامل + atomic RPCs لأكبر مرحلة في المنتج.
-- يَحرس مبدأ §1.5.2 (per-apartment voting) عبر 3 طبقات: UI + Server + DB.
--
-- يستفيد من كل دروس Codex من المراحل السابقة وقائياً:
--   - INSERT lock للحالة الابتدائية + null workflow fields
--   - BEFORE UPDATE trigger كامل (لا OF status فقط)
--   - Transition whitelist + per-transition field whitelist
--   - Tenant column (building_id) immutability
--   - SECURITY DEFINER RPCs للعمليات multi-table مع FOR UPDATE
--   - User reference scoping (vote_responses.user_id يَلتزم بـ auth.uid())
-- =============================================

-- =============================================
-- (1) Suggestions — workflow integrity
-- =============================================

-- (1a) INSERT lock: status='new' فقط
drop policy if exists "suggestions_insert_member" on public.suggestions;
create policy "suggestions_insert_member"
on public.suggestions for insert
to authenticated
with check (
  public.is_building_member(building_id)
  -- Workflow integrity
  and status = 'new'
  -- Ownership: غير المُديرين يُلزَمون بـ auth.uid() (لا انتحال).
  and (
    created_by = auth.uid()
    or public.is_super_admin()
    or public.user_has_role(
      building_id,
      array['admin', 'committee']::public.membership_role[]
    )
  )
);

-- (1b) Workflow trigger: tenant lock + transitions + field whitelist
create or replace function public.suggestions_validate_update()
returns trigger
language plpgsql
as $$
declare
  old_s public.suggestion_status := OLD.status;
  new_s public.suggestion_status := NEW.status;
begin
  -- Tenant immutability
  if NEW.building_id is distinct from OLD.building_id then
    raise exception 'building_id is immutable on suggestions'
      using errcode = 'check_violation';
  end if;

  -- created_by immutable (audit)
  if NEW.created_by is distinct from OLD.created_by then
    raise exception 'created_by is immutable on suggestions'
      using errcode = 'check_violation';
  end if;

  -- Same-status update: terminal states (converted_to_vote, rejected, archived) are locked.
  if old_s = new_s then
    if old_s in ('converted_to_vote', 'rejected', 'archived') then
      if NEW.title is distinct from OLD.title
         or NEW.description is distinct from OLD.description
      then
        raise exception 'Suggestion in % state is locked', old_s
          using errcode = 'check_violation';
      end if;
    end if;
    return NEW;
  end if;

  -- Codex round 1 P1: status changes restricted to admin/committee (or
  -- super-admin). The author can edit title/description in non-terminal
  -- states via the same-status branch above, but cannot mark their own
  -- suggestion as approved/rejected/archived/converted_to_vote.
  -- (convert_suggestion_to_vote RPC sets status='converted_to_vote', and runs
  -- as SECURITY DEFINER but auth.uid() still returns the original caller
  -- whom the RPC verified as admin/committee — so this check passes for
  -- legitimate RPC use.)
  if not (
    public.is_super_admin()
    or public.user_has_role(
      NEW.building_id,
      array['admin', 'committee']::public.membership_role[]
    )
  ) then
    raise exception
      'Only admin/committee can change a suggestion''s status (auth.uid=%)',
      auth.uid()
      using errcode = 'check_violation';
  end if;

  -- Transition whitelist:
  --   new -> discussion | pricing | converted_to_vote | rejected | archived | approved
  --   discussion -> pricing | converted_to_vote | rejected | archived | approved
  --   pricing -> converted_to_vote | rejected | archived | approved
  --   approved -> archived
  --   converted_to_vote/rejected/archived -> (terminal)
  if not (
    (old_s = 'new' and new_s in ('discussion', 'pricing', 'converted_to_vote', 'rejected', 'archived', 'approved'))
    or (old_s = 'discussion' and new_s in ('pricing', 'converted_to_vote', 'rejected', 'archived', 'approved'))
    or (old_s = 'pricing' and new_s in ('converted_to_vote', 'rejected', 'archived', 'approved'))
    or (old_s = 'approved' and new_s = 'archived')
  ) then
    raise exception 'Invalid suggestion status transition: % -> %', old_s, new_s
      using errcode = 'check_violation';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_suggestions_validate_update on public.suggestions;
create trigger trg_suggestions_validate_update
  before update on public.suggestions
  for each row
  execute function public.suggestions_validate_update();

-- =============================================
-- (2) Votes — workflow integrity
-- =============================================

-- (2a) INSERT lock: status='draft' + null transition fields
drop policy if exists "votes_admin_committee_manage" on public.votes;

-- Split FOR ALL into separate INSERT/UPDATE/DELETE for clearer scoping.
create policy "votes_insert_admin_committee"
on public.votes for insert
to authenticated
with check (
  (
    public.user_has_role(
      building_id,
      array['admin', 'committee']::public.membership_role[]
    )
    or public.is_super_admin()
  )
  -- Workflow integrity: new votes start as draft.
  and status = 'draft'
);

create policy "votes_update_admin_committee"
on public.votes for update
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

-- (No DELETE policy on votes — votes are part of governance audit trail and
--  should be cancelled via status='cancelled', not deleted.)

-- (2b) Workflow trigger
create or replace function public.votes_validate_update()
returns trigger
language plpgsql
as $$
declare
  old_s public.vote_status := OLD.status;
  new_s public.vote_status := NEW.status;
begin
  -- Tenant immutability
  if NEW.building_id is distinct from OLD.building_id then
    raise exception 'building_id is immutable on votes'
      using errcode = 'check_violation';
  end if;

  -- created_by immutable (audit)
  if NEW.created_by is distinct from OLD.created_by then
    raise exception 'created_by is immutable on votes'
      using errcode = 'check_violation';
  end if;

  -- suggestion_id immutable (set once at creation; reflects governance trail)
  if NEW.suggestion_id is distinct from OLD.suggestion_id then
    raise exception 'suggestion_id is immutable on votes'
      using errcode = 'check_violation';
  end if;

  -- Same-status updates
  if old_s = new_s then
    -- Terminal states (closed, cancelled): completely locked.
    if old_s in ('closed', 'cancelled') then
      if NEW.title             is distinct from OLD.title
         or NEW.description    is distinct from OLD.description
         or NEW.starts_at      is distinct from OLD.starts_at
         or NEW.ends_at        is distinct from OLD.ends_at
         or NEW.approval_rule  is distinct from OLD.approval_rule
         or NEW.custom_threshold is distinct from OLD.custom_threshold
         or NEW.estimated_cost is distinct from OLD.estimated_cost
      then
        raise exception 'Vote in % state is locked', old_s
          using errcode = 'check_violation';
      end if;
      return NEW;
    end if;

    -- Active state: no business field changes (vote can't be edited mid-flight).
    if old_s = 'active' then
      if NEW.title             is distinct from OLD.title
         or NEW.description    is distinct from OLD.description
         or NEW.starts_at      is distinct from OLD.starts_at
         or NEW.ends_at        is distinct from OLD.ends_at
         or NEW.approval_rule  is distinct from OLD.approval_rule
         or NEW.custom_threshold is distinct from OLD.custom_threshold
         or NEW.estimated_cost is distinct from OLD.estimated_cost
      then
        raise exception 'Vote in active state cannot be edited (cancel and create new)'
          using errcode = 'check_violation';
      end if;
      return NEW;
    end if;

    -- Draft: any field editable.
    return NEW;
  end if;

  -- Transition whitelist:
  --   draft -> active | cancelled
  --   active -> closed | cancelled
  --   closed/cancelled -> (terminal)
  if not (
    (old_s = 'draft' and new_s in ('active', 'cancelled'))
    or (old_s = 'active' and new_s in ('closed', 'cancelled'))
  ) then
    raise exception 'Invalid vote status transition: % -> %', old_s, new_s
      using errcode = 'check_violation';
  end if;

  -- Per-transition field freeze: business fields can't change during transitions.
  -- EXCEPTION (Codex round 1 P1): starts_at is allowed to change on
  -- draft → active so activate_vote can stamp the actual activation time
  -- (the draft's default starts_at was set at creation, which is meaningless).
  if NEW.title          is distinct from OLD.title
     or NEW.description is distinct from OLD.description
     or NEW.ends_at     is distinct from OLD.ends_at
     or NEW.approval_rule is distinct from OLD.approval_rule
     or NEW.custom_threshold is distinct from OLD.custom_threshold
     or NEW.estimated_cost is distinct from OLD.estimated_cost
  then
    raise exception
      'Cannot change business fields during vote transition % -> %',
      old_s, new_s
      using errcode = 'check_violation';
  end if;

  -- starts_at: only allowed to change on draft → active (set to activation time).
  if NEW.starts_at is distinct from OLD.starts_at then
    if not (old_s = 'draft' and new_s = 'active') then
      raise exception
        'starts_at can only change during draft -> active transition'
        using errcode = 'check_violation';
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_votes_validate_update on public.votes;
create trigger trg_votes_validate_update
  before update on public.votes
  for each row
  execute function public.votes_validate_update();

-- =============================================
-- (2c) vote_options change-lock (Codex round 1 P1)
-- =============================================
-- vote_options_admin_manage was FOR ALL — admin/committee could edit/delete
-- options on an active or closed vote, retroactively changing the meaning of
-- recorded votes. Lock all option mutations to votes in 'draft' status only.
-- (Options for draft votes are set up; once activated, they're frozen.)
-- =============================================

create or replace function public.vote_options_validate_change()
returns trigger
language plpgsql
as $$
declare
  v_vote_id uuid;
  v_status public.vote_status;
begin
  -- The vote_id depends on the operation: NEW for INSERT/UPDATE, OLD for DELETE.
  if TG_OP = 'DELETE' then
    v_vote_id := OLD.vote_id;
  else
    v_vote_id := NEW.vote_id;
    -- Block changing vote_id (would orphan the option)
    if TG_OP = 'UPDATE' and NEW.vote_id is distinct from OLD.vote_id then
      raise exception 'vote_options.vote_id is immutable'
        using errcode = 'check_violation';
    end if;
  end if;

  select status into v_status from public.votes where id = v_vote_id;
  if v_status is null then
    -- Vote doesn't exist (only happens during INSERT before vote exists, or
    -- during cascade delete). Allow — FK will catch invalid references.
    return case TG_OP when 'DELETE' then OLD else NEW end;
  end if;

  if v_status <> 'draft' then
    raise exception
      'vote_options can only be modified while parent vote is in draft (current=%)',
      v_status
      using errcode = 'check_violation';
  end if;

  return case TG_OP when 'DELETE' then OLD else NEW end;
end;
$$;

drop trigger if exists trg_vote_options_validate_change on public.vote_options;
create trigger trg_vote_options_validate_change
  before insert or update or delete on public.vote_options
  for each row
  execute function public.vote_options_validate_change();

-- =============================================
-- (3) Decisions — tenant lock
-- =============================================

create or replace function public.decisions_validate_update()
returns trigger
language plpgsql
as $$
begin
  if NEW.building_id is distinct from OLD.building_id then
    raise exception 'building_id is immutable on decisions'
      using errcode = 'check_violation';
  end if;
  if NEW.created_by is distinct from OLD.created_by then
    raise exception 'created_by is immutable on decisions'
      using errcode = 'check_violation';
  end if;
  if NEW.vote_id is distinct from OLD.vote_id then
    raise exception 'vote_id is immutable on decisions (governance trail)'
      using errcode = 'check_violation';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_decisions_validate_update on public.decisions;
create trigger trg_decisions_validate_update
  before update on public.decisions
  for each row
  execute function public.decisions_validate_update();

-- =============================================
-- (4) Vote responses — defense-in-depth tenant lock
-- =============================================
-- The composite FK already enforces apartment+vote tenant consistency, but
-- adding an explicit trigger gives a clear error message and protects against
-- any future RLS relaxations.
create or replace function public.vote_responses_validate_update()
returns trigger
language plpgsql
as $$
begin
  -- Vote responses are immutable once cast (governance trail).
  -- This trigger fires only if someone manages to UPDATE despite the
  -- absence of an UPDATE policy — defense-in-depth.
  raise exception 'vote_responses are immutable once cast'
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists trg_vote_responses_validate_update on public.vote_responses;
create trigger trg_vote_responses_validate_update
  before update on public.vote_responses
  for each row
  execute function public.vote_responses_validate_update();

-- =============================================
-- (5) RPC: cast_vote_for_apartment (atomic vote casting)
-- =============================================
-- §1.5.2 enforced at all three layers. This RPC adds:
--   - SELECT FOR UPDATE on the vote (prevents close-during-cast race)
--   - Specific Arabic error messages for each failure mode
--   - Single source of truth for the cast logic
-- The existing INSERT RLS policy "vote_responses_insert_voting_rep" still
-- applies as a final defense-in-depth check.
-- =============================================

create or replace function public.cast_vote_for_apartment(
  p_vote_id uuid,
  p_apartment_id uuid,
  p_option_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_vote public.votes%rowtype;
  v_caller uuid := auth.uid();
  v_response_id uuid;
  v_apartment public.apartments%rowtype;
begin
  if v_caller is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  -- Lock vote row to prevent close-during-cast race.
  select * into v_vote from public.votes where id = p_vote_id for update;
  if not found then
    raise exception 'Vote not found' using errcode = 'P0002';
  end if;

  -- Vote must be active and within window.
  if v_vote.status <> 'active' then
    raise exception 'Vote is not active (status=%)', v_vote.status
      using errcode = 'P0003';
  end if;
  if now() < v_vote.starts_at or now() > v_vote.ends_at then
    raise exception 'Vote is outside its open window'
      using errcode = 'P0004';
  end if;

  -- Apartment must be in the same building as the vote.
  select * into v_apartment from public.apartments where id = p_apartment_id;
  if not found or v_apartment.building_id <> v_vote.building_id then
    raise exception 'Apartment not in the same building as the vote'
      using errcode = 'P0005';
  end if;

  -- Caller must be active voting representative of the apartment.
  if not exists (
    select 1 from public.apartment_members am
    where am.apartment_id = p_apartment_id
      and am.user_id = v_caller
      and am.is_voting_representative = true
      and am.is_active = true
  ) then
    raise exception 'Caller is not the voting representative of this apartment'
      using errcode = 'P0006';
  end if;

  -- Option must belong to the vote.
  if not exists (
    select 1 from public.vote_options
    where id = p_option_id and vote_id = p_vote_id
  ) then
    raise exception 'Option does not belong to this vote'
      using errcode = 'P0007';
  end if;

  -- Apartment must not have already voted (UNIQUE constraint will also enforce).
  if exists (
    select 1 from public.vote_responses
    where vote_id = p_vote_id and apartment_id = p_apartment_id
  ) then
    raise exception 'Apartment has already voted on this vote'
      using errcode = 'P0008';
  end if;

  -- Insert the response.
  v_response_id := gen_random_uuid();
  insert into public.vote_responses (
    id, vote_id, option_id, user_id, apartment_id, building_id
  ) values (
    v_response_id, p_vote_id, p_option_id, v_caller, p_apartment_id, v_vote.building_id
  );

  return v_response_id;
end;
$$;

grant execute on function public.cast_vote_for_apartment(uuid, uuid, uuid) to authenticated;

-- =============================================
-- (6) RPC: convert_suggestion_to_vote (atomic conversion)
-- =============================================
-- Creates a vote linked to the suggestion, creates options, and marks the
-- suggestion as converted_to_vote — all in one transaction.
-- =============================================

create or replace function public.convert_suggestion_to_vote(
  p_suggestion_id uuid,
  p_title text,
  p_description text,
  p_options text[],
  p_ends_at timestamptz,
  p_approval_rule public.approval_rule,
  p_custom_threshold numeric,
  p_estimated_cost numeric
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_suggestion public.suggestions%rowtype;
  v_caller uuid := auth.uid();
  v_vote_id uuid;
  v_is_manager boolean;
  v_label text;
  v_idx int := 0;
begin
  if v_caller is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  -- Lock suggestion row.
  select * into v_suggestion from public.suggestions
  where id = p_suggestion_id for update;
  if not found then
    raise exception 'Suggestion not found' using errcode = 'P0002';
  end if;

  v_is_manager := public.is_super_admin() or public.user_has_role(
    v_suggestion.building_id,
    array['admin', 'committee']::public.membership_role[]
  );
  if not v_is_manager then
    raise exception 'Access denied: admin/committee only' using errcode = 'P0003';
  end if;

  -- Suggestion must be in a convertible state.
  if v_suggestion.status not in ('new', 'discussion', 'pricing') then
    raise exception 'Suggestion in % state cannot be converted', v_suggestion.status
      using errcode = 'P0004';
  end if;

  -- Validate options.
  if p_options is null or array_length(p_options, 1) is null or array_length(p_options, 1) < 2 then
    raise exception 'Vote needs at least 2 options' using errcode = 'P0005';
  end if;

  -- Validate dates and rule.
  if p_ends_at <= now() then
    raise exception 'ends_at must be in the future' using errcode = 'P0006';
  end if;
  if p_approval_rule = 'custom' and (p_custom_threshold is null or p_custom_threshold <= 0 or p_custom_threshold > 1) then
    raise exception 'custom_threshold must be in (0, 1] when approval_rule = custom'
      using errcode = 'P0007';
  end if;

  -- Create the vote (status='draft' to satisfy INSERT lock; transition to active separately).
  v_vote_id := gen_random_uuid();
  insert into public.votes (
    id, building_id, title, description, suggestion_id,
    starts_at, ends_at, status, approval_rule, custom_threshold,
    estimated_cost, created_by
  ) values (
    v_vote_id, v_suggestion.building_id, p_title, p_description, p_suggestion_id,
    now(), p_ends_at, 'draft', p_approval_rule, p_custom_threshold,
    p_estimated_cost, v_caller
  );

  -- Create options.
  foreach v_label in array p_options loop
    if length(trim(v_label)) > 0 then
      insert into public.vote_options (vote_id, label, sort_order)
      values (v_vote_id, v_label, v_idx);
      v_idx := v_idx + 1;
    end if;
  end loop;

  if v_idx < 2 then
    raise exception 'Vote needs at least 2 non-empty options' using errcode = 'P0005';
  end if;

  -- Mark suggestion as converted.
  update public.suggestions set status = 'converted_to_vote'
  where id = p_suggestion_id;

  return v_vote_id;
end;
$$;

grant execute on function public.convert_suggestion_to_vote(
  uuid, text, text, text[], timestamptz, public.approval_rule, numeric, numeric
) to authenticated;

-- =============================================
-- (7) RPC: activate_vote / close_vote / cancel_vote
-- =============================================

create or replace function public.activate_vote(p_vote_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_vote public.votes%rowtype;
  v_caller uuid := auth.uid();
  v_options_count int;
begin
  if v_caller is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  select * into v_vote from public.votes where id = p_vote_id for update;
  if not found then
    raise exception 'Vote not found' using errcode = 'P0002';
  end if;

  if not (public.is_super_admin() or public.user_has_role(
    v_vote.building_id, array['admin', 'committee']::public.membership_role[]
  )) then
    raise exception 'Access denied: admin/committee only' using errcode = 'P0003';
  end if;

  if v_vote.status <> 'draft' then
    raise exception 'Only draft votes can be activated (current=%)', v_vote.status
      using errcode = 'P0004';
  end if;

  select count(*) into v_options_count from public.vote_options where vote_id = p_vote_id;
  if v_options_count < 2 then
    raise exception 'Vote needs at least 2 options before activation'
      using errcode = 'P0005';
  end if;

  if v_vote.ends_at <= now() then
    raise exception 'ends_at must be in the future at activation time'
      using errcode = 'P0006';
  end if;

  update public.votes set status = 'active', starts_at = now()
  where id = p_vote_id;
end;
$$;

grant execute on function public.activate_vote(uuid) to authenticated;

create or replace function public.close_vote(p_vote_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_vote public.votes%rowtype;
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  select * into v_vote from public.votes where id = p_vote_id for update;
  if not found then
    raise exception 'Vote not found' using errcode = 'P0002';
  end if;

  if not (public.is_super_admin() or public.user_has_role(
    v_vote.building_id, array['admin', 'committee']::public.membership_role[]
  )) then
    raise exception 'Access denied: admin/committee only' using errcode = 'P0003';
  end if;

  if v_vote.status <> 'active' then
    raise exception 'Only active votes can be closed (current=%)', v_vote.status
      using errcode = 'P0004';
  end if;

  update public.votes set status = 'closed' where id = p_vote_id;
end;
$$;

grant execute on function public.close_vote(uuid) to authenticated;

create or replace function public.cancel_vote(p_vote_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_vote public.votes%rowtype;
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  select * into v_vote from public.votes where id = p_vote_id for update;
  if not found then
    raise exception 'Vote not found' using errcode = 'P0002';
  end if;

  if not (public.is_super_admin() or public.user_has_role(
    v_vote.building_id, array['admin', 'committee']::public.membership_role[]
  )) then
    raise exception 'Access denied: admin/committee only' using errcode = 'P0003';
  end if;

  if v_vote.status not in ('draft', 'active') then
    raise exception 'Only draft or active votes can be cancelled (current=%)', v_vote.status
      using errcode = 'P0004';
  end if;

  update public.votes set status = 'cancelled' where id = p_vote_id;
end;
$$;

grant execute on function public.cancel_vote(uuid) to authenticated;

-- =============================================
-- (8) Codex round 2 P1 — Restrict vote_responses SELECT
-- =============================================
-- السياسة السابقة كانت تَسمح لأي عضو في العمارة بقراءة كل الردود (user_id +
-- apartment_id + option_id) حتى للتصويت active. هذا يخالف الخصوصية: الساكن
-- العادي قبل closing لا يَجب أن يَرى تفاصيل أصوات الشقق الأخرى.
-- الحل: SELECT للـ admin/committee/super، أو الـ voter يَرى صفه فقط (شفافية
-- ذاتية). للنتائج المُجمَّعة: SECURITY DEFINER RPC منفصلة (get_vote_aggregate_*).
-- =============================================

drop policy if exists "vote_responses_select_members" on public.vote_responses;

create policy "vote_responses_select_admin_or_self"
on public.vote_responses for select
using (
  public.is_super_admin()
  or public.user_has_role(
    building_id,
    array['admin', 'committee']::public.membership_role[]
  )
  or user_id = auth.uid()
);

-- =============================================
-- (9) Aggregate RPCs (replace raw SELECTs in queries)
-- =============================================
-- Returns null for non-admin if vote is not yet closed. Admin always sees.
-- Members of the building can call; non-members get exception.

create or replace function public.get_vote_voted_count(p_vote_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_vote public.votes%rowtype;
  v_is_admin boolean;
begin
  select * into v_vote from public.votes where id = p_vote_id;
  if not found then
    raise exception 'Vote not found' using errcode = 'P0002';
  end if;

  v_is_admin := public.is_super_admin() or public.user_has_role(
    v_vote.building_id, array['admin', 'committee']::public.membership_role[]
  );

  if not (v_is_admin or public.is_building_member(v_vote.building_id)) then
    raise exception 'Access denied' using errcode = 'P0003';
  end if;

  -- Privacy: non-admin only sees count after closing.
  if not v_is_admin and v_vote.status <> 'closed' then
    return null;
  end if;

  return (select count(distinct apartment_id) from public.vote_responses where vote_id = p_vote_id);
end;
$$;

grant execute on function public.get_vote_voted_count(uuid) to authenticated;

create or replace function public.get_vote_aggregate_counts(p_vote_id uuid)
returns table (option_id uuid, vote_count bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_vote public.votes%rowtype;
  v_is_admin boolean;
begin
  select * into v_vote from public.votes where id = p_vote_id;
  if not found then
    raise exception 'Vote not found' using errcode = 'P0002';
  end if;

  v_is_admin := public.is_super_admin() or public.user_has_role(
    v_vote.building_id, array['admin', 'committee']::public.membership_role[]
  );

  if not (v_is_admin or public.is_building_member(v_vote.building_id)) then
    raise exception 'Access denied' using errcode = 'P0003';
  end if;

  if not v_is_admin and v_vote.status <> 'closed' then
    raise exception 'Results not yet available (vote not closed)' using errcode = 'P0010';
  end if;

  return query
    select vr.option_id, count(*)::bigint
    from public.vote_responses vr
    where vr.vote_id = p_vote_id
    group by vr.option_id;
end;
$$;

grant execute on function public.get_vote_aggregate_counts(uuid) to authenticated;

-- Batched count for the votes list page. Returns one row per requested vote.
create or replace function public.get_votes_voted_counts(p_vote_ids uuid[])
returns table (vote_id uuid, voted bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  return query
    select v.id as vote_id,
           case
             -- Admin/committee/super always sees count
             when public.is_super_admin()
                  or public.user_has_role(v.building_id, array['admin', 'committee']::public.membership_role[])
               then (select count(distinct apartment_id) from public.vote_responses where vote_id = v.id)
             -- Resident only sees count after closing
             when v.status = 'closed' and public.is_building_member(v.building_id)
               then (select count(distinct apartment_id) from public.vote_responses where vote_id = v.id)
             else null
           end as voted
    from public.votes v
    where v.id = any(p_vote_ids);
end;
$$;

grant execute on function public.get_votes_voted_counts(uuid[]) to authenticated;

-- =============================================
-- (10) Codex round 2 P1 — decisions.vote_id must reference a closed vote
-- =============================================
-- decisions_admin_committee_manage allowed any admin/committee to insert with
-- vote_id pointing to draft/active/cancelled votes — making the audit trail
-- look like a decision came out of an unfinished vote. Enforce in DB:
-- vote_id must be NULL or reference a closed vote in the same building.
-- =============================================

create or replace function public.decisions_validate_vote_link()
returns trigger
language plpgsql
as $$
declare
  v_vote_status public.vote_status;
  v_vote_building uuid;
begin
  if NEW.vote_id is null then
    return NEW;
  end if;

  select status, building_id into v_vote_status, v_vote_building
  from public.votes where id = NEW.vote_id;

  if v_vote_status is null then
    raise exception 'decisions.vote_id references nonexistent vote'
      using errcode = 'check_violation';
  end if;
  if v_vote_building <> NEW.building_id then
    raise exception 'decisions.vote_id is in a different building (tenant breach)'
      using errcode = 'check_violation';
  end if;
  if v_vote_status <> 'closed' then
    raise exception
      'decisions.vote_id must reference a closed vote (current status=%)',
      v_vote_status
      using errcode = 'check_violation';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_decisions_validate_vote_link on public.decisions;
create trigger trg_decisions_validate_vote_link
  before insert or update on public.decisions
  for each row
  execute function public.decisions_validate_vote_link();

-- =============================================
-- (11) Codex round 2 P2 — Atomic standalone vote creation RPC
-- =============================================
-- The action's standalone path (vote without suggestion) was: insert vote,
-- then insert options, then on options-failure delete vote. But there's no
-- DELETE policy on votes — cleanup silently fails leaving an orphan draft.
-- Move this into a SECURITY DEFINER RPC for atomicity.
-- =============================================

create or replace function public.create_vote_with_options(
  p_building_id uuid,
  p_title text,
  p_description text,
  p_options text[],
  p_ends_at timestamptz,
  p_approval_rule public.approval_rule,
  p_custom_threshold numeric,
  p_estimated_cost numeric
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_vote_id uuid;
  v_caller uuid := auth.uid();
  v_label text;
  v_idx int := 0;
begin
  if v_caller is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  if not (public.is_super_admin() or public.user_has_role(
    p_building_id, array['admin', 'committee']::public.membership_role[]
  )) then
    raise exception 'Access denied: admin/committee only' using errcode = 'P0003';
  end if;

  if p_options is null or array_length(p_options, 1) is null or array_length(p_options, 1) < 2 then
    raise exception 'Vote needs at least 2 options' using errcode = 'P0005';
  end if;

  if p_ends_at <= now() then
    raise exception 'ends_at must be in the future' using errcode = 'P0006';
  end if;
  if p_approval_rule = 'custom' and (p_custom_threshold is null or p_custom_threshold <= 0 or p_custom_threshold > 1) then
    raise exception 'custom_threshold must be in (0, 1] when approval_rule = custom'
      using errcode = 'P0007';
  end if;

  v_vote_id := gen_random_uuid();
  insert into public.votes (
    id, building_id, title, description,
    starts_at, ends_at, status, approval_rule, custom_threshold,
    estimated_cost, created_by
  ) values (
    v_vote_id, p_building_id, p_title, p_description,
    now(), p_ends_at, 'draft', p_approval_rule, p_custom_threshold,
    p_estimated_cost, v_caller
  );

  foreach v_label in array p_options loop
    if length(trim(v_label)) > 0 then
      insert into public.vote_options (vote_id, label, sort_order)
      values (v_vote_id, v_label, v_idx);
      v_idx := v_idx + 1;
    end if;
  end loop;

  if v_idx < 2 then
    raise exception 'Vote needs at least 2 non-empty options' using errcode = 'P0005';
  end if;

  return v_vote_id;
end;
$$;

grant execute on function public.create_vote_with_options(
  uuid, text, text, text[], timestamptz, public.approval_rule, numeric, numeric
) to authenticated;

-- =============================================
-- (12) Codex round 3 P2 — list_user_vote_apartments RPC
-- =============================================
-- Side effect of (8): the restricted vote_responses SELECT policy means a
-- newly-assigned voting rep cannot read the previous rep's response row.
-- The query in listVotableApartmentsForUser used raw SELECT, so the new rep
-- saw the apartment as "votable" → cast button shown → cast RPC fails on
-- UNIQUE. This breaks the planned scenario.
--
-- Fix: SECURITY DEFINER RPC returns ALL apartments the caller is voting rep
-- for, with already-voted status (and the prior voter's display name +
-- option for transparency). Bypasses the SELECT restriction safely.
-- =============================================

create or replace function public.list_user_vote_apartments(p_vote_id uuid)
returns table (
  apartment_id uuid,
  apartment_number text,
  already_voted boolean,
  voted_by_user_name text,
  voted_at timestamptz,
  voted_option_label text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_vote public.votes%rowtype;
begin
  if v_caller is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  select * into v_vote from public.votes where id = p_vote_id;
  if not found then
    raise exception 'Vote not found' using errcode = 'P0002';
  end if;

  if not public.is_building_member(v_vote.building_id) then
    raise exception 'Access denied' using errcode = 'P0003';
  end if;

  return query
    select
      a.id,
      a.number,
      vr.id is not null as already_voted,
      p.full_name,
      vr.created_at,
      vo.label
    from public.apartment_members am
    join public.apartments a on a.id = am.apartment_id
    left join public.vote_responses vr
      on vr.vote_id = p_vote_id and vr.apartment_id = am.apartment_id
    left join public.profiles p on p.id = vr.user_id
    left join public.vote_options vo on vo.id = vr.option_id
    where am.building_id = v_vote.building_id
      and am.user_id = v_caller
      and am.is_voting_representative = true
      and am.is_active = true
    order by a.number;
end;
$$;

grant execute on function public.list_user_vote_apartments(uuid) to authenticated;

-- End 13_phase10.sql
