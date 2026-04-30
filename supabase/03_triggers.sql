-- =============================================
-- 03_triggers.sql — Triggers
-- =============================================

-- =============================================
-- updated_at trigger function
-- =============================================
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Apply to every table with updated_at column
create trigger trg_buildings_updated before update on public.buildings
  for each row execute function public.update_updated_at();

create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.update_updated_at();

create trigger trg_apartments_updated before update on public.apartments
  for each row execute function public.update_updated_at();

create trigger trg_payments_updated before update on public.payments
  for each row execute function public.update_updated_at();

create trigger trg_expenses_updated before update on public.expenses
  for each row execute function public.update_updated_at();

create trigger trg_maint_updated before update on public.maintenance_requests
  for each row execute function public.update_updated_at();

create trigger trg_tasks_updated before update on public.tasks
  for each row execute function public.update_updated_at();

create trigger trg_suggestions_updated before update on public.suggestions
  for each row execute function public.update_updated_at();

create trigger trg_votes_updated before update on public.votes
  for each row execute function public.update_updated_at();

-- =============================================
-- handle_new_user: auto-create profile on auth.users insert
-- =============================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================
-- audit_changes: generic audit trigger for sensitive tables
-- (writes to audit_logs with old/new JSONB)
-- =============================================
create or replace function public.audit_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_building_id uuid;
  v_entity_id uuid;
begin
  if TG_OP = 'DELETE' then
    v_building_id := old.building_id;
    v_entity_id := old.id;
  else
    v_building_id := new.building_id;
    v_entity_id := new.id;
  end if;

  insert into public.audit_logs (
    building_id, actor_id, action, entity_type, entity_id, old_values, new_values
  ) values (
    v_building_id,
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    v_entity_id,
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  if TG_OP = 'DELETE' then
    return old;
  else
    return new;
  end if;
end;
$$;

-- Apply audit trigger to financially / governance-sensitive tables
-- (those listed in PLAN §"Audit Logs")
create trigger trg_audit_payments
  after insert or update or delete on public.payments
  for each row execute function public.audit_changes();

create trigger trg_audit_expenses
  after insert or update or delete on public.expenses
  for each row execute function public.audit_changes();

create trigger trg_audit_maintenance
  after insert or update or delete on public.maintenance_requests
  for each row execute function public.audit_changes();

create trigger trg_audit_votes
  after insert or update or delete on public.votes
  for each row execute function public.audit_changes();

create trigger trg_audit_decisions
  after insert or update or delete on public.decisions
  for each row execute function public.audit_changes();

create trigger trg_audit_memberships
  after insert or update or delete on public.building_memberships
  for each row execute function public.audit_changes();

create trigger trg_audit_apt_members
  after insert or update or delete on public.apartment_members
  for each row execute function public.audit_changes();

-- End 03_triggers.sql
