-- =============================================
-- 22_phase21.sql — Phase 21 (/contact with password upfront — option D)
-- =============================================
-- يطبَّق بعد 21_phase20.sql.
--
-- خَلفية:
--   Phase 16 صَمَّم /contact كـ "CRM lead form" — anon زائر يَملأ نَموذج
--   تَواصل، super_admin يَراه في /super-admin/requests، يَتواصل يَدوياً.
--   لا حساب يُنشأ.
--
--   Phase 20 (rc.1+4) أَدخَل password upfront لـ /subscribe (basic/pro). الآن
--   /contact (trial/enterprise) يَحتاج نَفس النَمط ليُوحَّد UX: كل نَموذج
--   يَطلب password، كل المُستخدمين يَنتظرون موافَقة super_admin.
--
-- التَغييرات:
--   1. subscription_requests يَكتسب عمود applicant_user_id (nullable للـ
--      backwards compat مع legacy rows)
--   2. submit_contact_request يَقبل p_user_id اختياري
--   3. get_my_pending_contact_requests RPC جَديدة للـ /account/pending gate
--   4. trigger يَحفظ applicant_user_id immutable post-INSERT
-- =============================================

-- =============================================
-- (1) Add applicant_user_id column
-- =============================================
alter table public.subscription_requests
  add column if not exists applicant_user_id uuid
  references auth.users(id) on delete set null;

-- Index for the user-scoped lookup in get_my_pending_contact_requests
create index if not exists idx_subscription_requests_applicant
  on public.subscription_requests (applicant_user_id, status)
  where applicant_user_id is not null;

-- =============================================
-- (2) Update submit_contact_request — accept optional p_user_id
-- =============================================
-- DROP old signature first (PostgreSQL function overloading by arity).
drop function if exists public.submit_contact_request(
  text, text, text, text, text, int, text, text, text
);

create or replace function public.submit_contact_request(
  p_full_name text,
  p_email text,
  p_phone text,
  p_building_name text,
  p_city text,
  p_estimated_apartments int,
  p_interested_tier text,
  p_message text,
  p_honeypot text,
  p_user_id uuid default null                  -- v0.21: pre-registered user
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  -- (1) honeypot — bot detection
  if p_honeypot is not null and length(p_honeypot) > 0 then
    raise exception 'invalid submission' using errcode = 'check_violation';
  end if;

  -- (2) length + format validation
  if p_email is null
     or length(p_email) < 5
     or length(p_email) > 254
     or position('@' in p_email) = 0 then
    raise exception 'invalid email' using errcode = 'check_violation';
  end if;
  if p_full_name is null
     or length(p_full_name) < 2
     or length(p_full_name) > 120 then
    raise exception 'invalid full_name' using errcode = 'check_violation';
  end if;
  if p_building_name is null
     or length(p_building_name) < 2
     or length(p_building_name) > 200 then
    raise exception 'invalid building_name' using errcode = 'check_violation';
  end if;
  if p_phone is not null and length(p_phone) > 40 then
    raise exception 'phone too long' using errcode = 'check_violation';
  end if;
  if p_city is not null and length(p_city) > 80 then
    raise exception 'city too long' using errcode = 'check_violation';
  end if;
  if p_message is not null and length(p_message) > 2000 then
    raise exception 'message too long' using errcode = 'check_violation';
  end if;
  if p_estimated_apartments is not null
     and (p_estimated_apartments <= 0 or p_estimated_apartments > 10000) then
    raise exception 'invalid apartments count' using errcode = 'check_violation';
  end if;
  if p_interested_tier is not null
     and p_interested_tier not in ('trial', 'basic', 'pro', 'enterprise') then
    raise exception 'invalid tier' using errcode = 'check_violation';
  end if;

  -- v0.21: validate p_user_id if provided
  if p_user_id is not null then
    if not exists (select 1 from auth.users where id = p_user_id) then
      raise exception 'p_user_id does not match any auth.users row'
        using errcode = 'P0002';
    end if;
  end if;

  -- (3) INSERT
  insert into public.subscription_requests (
    full_name, email, phone, building_name, city,
    estimated_apartments, interested_tier, message,
    honeypot, status, applicant_user_id
  ) values (
    p_full_name,
    p_email,
    nullif(p_phone, ''),
    p_building_name,
    nullif(p_city, ''),
    p_estimated_apartments,
    nullif(p_interested_tier, ''),
    nullif(p_message, ''),
    null,                                       -- honeypot forced
    'new',                                      -- status forced
    p_user_id                                   -- v0.21: pre-registered user
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.submit_contact_request(
  text, text, text, text, text, int, text, text, text, uuid
) from public;
grant execute on function public.submit_contact_request(
  text, text, text, text, text, int, text, text, text, uuid
) to service_role;

-- =============================================
-- (3) get_my_pending_contact_requests — for /account/pending page
-- =============================================
create or replace function public.get_my_pending_contact_requests()
returns table (
  id uuid,
  status text,
  building_name text,
  interested_tier text,
  created_at timestamptz,
  notes text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return;
  end if;

  return query
  select
    r.id, r.status, r.building_name,
    r.interested_tier, r.created_at, r.notes
  from public.subscription_requests r
  where r.applicant_user_id = v_user_id
    and r.status in ('new', 'contacted', 'qualified')   -- not yet closed
  order by r.created_at desc;
end;
$$;

revoke execute on function public.get_my_pending_contact_requests() from public;
grant execute on function public.get_my_pending_contact_requests() to authenticated;

-- =============================================
-- (4) Update workflow trigger — applicant_user_id immutable post-INSERT
-- =============================================
-- The Phase 16 trigger already exists; we re-create it to add the new column
-- to the immutability list. Other behavior (status whitelist, etc.) preserved.
create or replace function public.subscription_requests_validate_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- audit + identity fields immutable
  if NEW.created_at is distinct from OLD.created_at then
    raise exception 'created_at is immutable on subscription_requests'
      using errcode = 'check_violation';
  end if;
  if NEW.email is distinct from OLD.email
     or NEW.full_name is distinct from OLD.full_name
     or NEW.building_name is distinct from OLD.building_name
     or NEW.phone is distinct from OLD.phone
     or NEW.city is distinct from OLD.city
     or NEW.estimated_apartments is distinct from OLD.estimated_apartments
     or NEW.interested_tier is distinct from OLD.interested_tier
     or NEW.message is distinct from OLD.message
     or NEW.honeypot is distinct from OLD.honeypot then
    raise exception 'submission fields are immutable on subscription_requests'
      using errcode = 'check_violation';
  end if;
  -- v0.21: applicant_user_id also immutable post-INSERT
  if NEW.applicant_user_id is distinct from OLD.applicant_user_id then
    raise exception 'applicant_user_id is immutable on subscription_requests'
      using errcode = 'check_violation';
  end if;
  return NEW;
end;
$$;

-- The trigger itself is already attached from 17_phase16.sql; the function
-- replacement above takes effect on next UPDATE.

-- End 22_phase21.sql
