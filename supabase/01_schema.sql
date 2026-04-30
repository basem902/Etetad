-- =============================================
-- 01_schema.sql — Tables + ENUMs + Indexes
-- نظام إدارة العمارة (imarah) — Multi-tenant SaaS
-- =============================================
-- يطبَّق على Supabase fresh قبل باقي الملفات.
-- =============================================

-- gen_random_uuid() is built-in (Postgres 13+) — no extension needed for the schema.
-- pgcrypto is required only by the seed file (for crypt()) — declared there.

-- =============================================
-- ENUMs (17 ENUMs)
-- =============================================

create type subscription_plan as enum ('trial', 'basic', 'pro', 'enterprise');
create type subscription_status as enum ('trial', 'active', 'past_due', 'cancelled', 'expired');
create type membership_role as enum ('admin', 'treasurer', 'committee', 'resident', 'technician');
create type apartment_relation as enum ('owner', 'resident', 'representative');
create type apartment_status as enum ('occupied', 'vacant', 'under_maintenance');
create type payment_method as enum ('cash', 'bank_transfer', 'online', 'cheque');
-- payment_status: pending|approved|rejected فقط (لا حالات إلكترونية — §1.5.1)
create type payment_status as enum ('pending', 'approved', 'rejected');
create type expense_status as enum ('draft', 'pending_review', 'approved', 'rejected', 'paid', 'cancelled');
create type maintenance_location as enum ('apartment', 'entrance', 'elevator', 'roof', 'parking', 'other');
create type maintenance_priority as enum ('low', 'medium', 'high', 'urgent');
create type maintenance_status as enum (
  'new', 'reviewing', 'waiting_quote', 'waiting_approval',
  'in_progress', 'completed', 'rejected', 'reopened'
);
create type task_status as enum ('todo', 'in_progress', 'waiting_external', 'completed', 'overdue');
create type task_priority as enum ('low', 'medium', 'high');
create type suggestion_status as enum (
  'new', 'discussion', 'pricing', 'converted_to_vote', 'approved', 'rejected', 'archived'
);
create type vote_status as enum ('draft', 'active', 'closed', 'cancelled');
create type approval_rule as enum ('simple_majority', 'two_thirds', 'custom');
create type decision_status as enum ('approved', 'rejected', 'implemented', 'postponed');

-- =============================================
-- TABLE 1/17: buildings (Tenant root)
-- =============================================
create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  city text,
  country text not null default 'SA',
  total_apartments integer not null default 0 check (total_apartments >= 0),
  default_monthly_fee numeric(10, 2) not null default 0 check (default_monthly_fee >= 0),
  currency text not null default 'SAR',
  logo_url text,

  -- subscription state (managed via super-admin server actions only)
  subscription_plan subscription_plan not null default 'trial',
  subscription_status subscription_status not null default 'trial',
  trial_ends_at timestamptz default (now() + interval '30 days'),
  subscription_ends_at timestamptz,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_buildings_subscription on public.buildings(subscription_status);
create index idx_buildings_trial_ends on public.buildings(trial_ends_at) where subscription_status = 'trial';

-- =============================================
-- TABLE 2/17: profiles
-- (1-to-1 with auth.users; super_admin flag is platform-level)
-- =============================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  is_super_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_profiles_super_admin on public.profiles(is_super_admin) where is_super_admin = true;

-- =============================================
-- TABLE 3/17: building_memberships
-- (user ↔ building, with role)
-- =============================================
create table public.building_memberships (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role membership_role not null,
  is_active boolean not null default true,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (building_id, user_id)
);

create index idx_memberships_user on public.building_memberships(user_id);
create index idx_memberships_building on public.building_memberships(building_id);
create index idx_memberships_role on public.building_memberships(building_id, role);
create index idx_memberships_active on public.building_memberships(building_id, is_active);

-- =============================================
-- TABLE 4/17: apartments
-- =============================================
create table public.apartments (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  number text not null,
  floor integer,
  monthly_fee numeric(10, 2) not null default 0 check (monthly_fee >= 0),
  status apartment_status not null default 'vacant',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (building_id, number),
  -- Composite unique to enable tenant-consistent composite FKs from child tables
  -- (apartment_members, payments, maintenance_requests, vote_responses).
  constraint apartments_id_building_unique unique (id, building_id)
);

create index idx_apartments_building on public.apartments(building_id);
create index idx_apartments_status on public.apartments(building_id, status);

-- =============================================
-- TABLE 5/17: apartment_members
-- (user ↔ apartment, with relation type and voting representative flag)
-- =============================================
create table public.apartment_members (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  -- Tenant-consistent: composite FK below ensures apartment is in same building.
  apartment_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  relation_type apartment_relation not null,
  is_voting_representative boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (apartment_id, user_id, relation_type),
  constraint fk_apt_members_apartment_tenant
    foreign key (apartment_id, building_id)
    references public.apartments(id, building_id)
    on delete cascade
);

-- §1.5.2: at most one ACTIVE voting representative per apartment
create unique index idx_one_voting_rep_per_apartment
  on public.apartment_members (apartment_id)
  where is_voting_representative = true and is_active = true;

create index idx_apt_members_building on public.apartment_members(building_id);
create index idx_apt_members_apartment on public.apartment_members(apartment_id);
create index idx_apt_members_user on public.apartment_members(user_id);
create index idx_apt_members_voting_rep on public.apartment_members(apartment_id, is_voting_representative)
  where is_active = true;

-- =============================================
-- TABLE 6/17: vendors
-- =============================================
create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  name text not null,
  phone text,
  specialty text,
  rating numeric(2, 1) check (rating is null or (rating >= 0 and rating <= 5)),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  -- Composite unique for tenant-consistent FK from expenses.vendor_id.
  constraint vendors_id_building_unique unique (id, building_id)
);

create index idx_vendors_building on public.vendors(building_id);

-- =============================================
-- TABLE 7/17: payments
-- §1.5.1: status فقط pending|approved|rejected — لا بوابات.
-- §1.5.1: receipt_url إلزامي عند الإنشاء.
-- §1.5.1: rejection_reason إلزامي عند rejected.
-- =============================================
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  -- Tenant-consistent: composite FK below ensures apartment is in same building.
  apartment_id uuid not null,
  user_id uuid references auth.users(id) on delete set null,
  amount numeric(10, 2) not null check (amount > 0),
  payment_date date not null default current_date,
  period_month date not null,
  method payment_method not null default 'cash',
  status payment_status not null default 'pending',
  -- §1.5.1: لا دفعة بدون إيصال
  receipt_url text not null,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_payments_rejection_reason
    check (status <> 'rejected' or (rejection_reason is not null and length(trim(rejection_reason)) > 0)),
  constraint chk_payments_receipt_nonempty
    check (length(trim(receipt_url)) > 0),
  -- Tenant-consistent FK: apartment must be in same building.
  constraint fk_payments_apartment_tenant
    foreign key (apartment_id, building_id)
    references public.apartments(id, building_id)
    on delete restrict
);

create index idx_payments_building on public.payments(building_id);
create index idx_payments_apartment on public.payments(apartment_id);
create index idx_payments_user on public.payments(user_id);
create index idx_payments_period on public.payments(building_id, period_month);
create index idx_payments_status on public.payments(building_id, status);
create index idx_payments_created_by on public.payments(created_by);

-- =============================================
-- TABLE 8/17: expenses
-- =============================================
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  title text not null,
  description text,
  category text,
  amount numeric(10, 2) not null check (amount > 0),
  expense_date date not null default current_date,
  status expense_status not null default 'draft',
  invoice_url text,
  receipt_url text,
  -- Nullable; composite FK below enforces tenant when present.
  vendor_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_expenses_cancellation_reason
    check (status <> 'cancelled' or (cancellation_reason is not null and length(trim(cancellation_reason)) > 0)),
  -- Composite unique for tenant-consistent FKs (maintenance_requests, decisions).
  constraint expenses_id_building_unique unique (id, building_id),
  -- Tenant-consistent FK to vendors (PG15+ partial set null).
  constraint fk_expenses_vendor_tenant
    foreign key (vendor_id, building_id)
    references public.vendors(id, building_id)
    on delete set null (vendor_id)
);

create index idx_expenses_building on public.expenses(building_id);
create index idx_expenses_status on public.expenses(building_id, status);
create index idx_expenses_date on public.expenses(building_id, expense_date);
create index idx_expenses_vendor on public.expenses(vendor_id);
create index idx_expenses_category on public.expenses(building_id, category);

-- =============================================
-- TABLE 9/17: maintenance_requests
-- =============================================
create table public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  -- Nullable; composite FKs below enforce tenant when present.
  apartment_id uuid,
  requested_by uuid references auth.users(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  title text not null,
  description text,
  location_type maintenance_location not null default 'other',
  priority maintenance_priority not null default 'medium',
  status maintenance_status not null default 'new',
  before_image_url text,
  after_image_url text,
  cost numeric(10, 2) check (cost is null or cost >= 0),
  related_expense_id uuid,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Tenant-consistent composite FKs (PG15+ partial set null on the optional col only).
  constraint fk_maint_apartment_tenant
    foreign key (apartment_id, building_id)
    references public.apartments(id, building_id)
    on delete set null (apartment_id),
  constraint fk_maint_expense_tenant
    foreign key (related_expense_id, building_id)
    references public.expenses(id, building_id)
    on delete set null (related_expense_id)
);

create index idx_maint_building on public.maintenance_requests(building_id);
create index idx_maint_status on public.maintenance_requests(building_id, status);
create index idx_maint_assigned on public.maintenance_requests(assigned_to);
create index idx_maint_apartment on public.maintenance_requests(apartment_id);
create index idx_maint_priority on public.maintenance_requests(building_id, priority);

-- =============================================
-- TABLE 10/17: tasks
-- =============================================
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  title text not null,
  description text,
  assigned_to uuid references auth.users(id) on delete set null,
  status task_status not null default 'todo',
  priority task_priority not null default 'medium',
  due_date date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_tasks_building on public.tasks(building_id);
create index idx_tasks_assigned on public.tasks(assigned_to);
create index idx_tasks_due on public.tasks(building_id, due_date);
create index idx_tasks_status on public.tasks(building_id, status);

-- =============================================
-- TABLE 11/17: suggestions
-- =============================================
create table public.suggestions (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  title text not null,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  status suggestion_status not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Composite unique for tenant-consistent FK from votes.suggestion_id.
  constraint suggestions_id_building_unique unique (id, building_id)
);

create index idx_suggestions_building on public.suggestions(building_id);
create index idx_suggestions_status on public.suggestions(building_id, status);

-- =============================================
-- TABLE 12/17: votes
-- §1.5.2: NO `voting_scope` — التصويت دائماً per-apartment
-- =============================================
create table public.votes (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  title text not null,
  description text,
  -- Nullable; composite FK below enforces tenant when present.
  suggestion_id uuid,
  estimated_cost numeric(10, 2) check (estimated_cost is null or estimated_cost >= 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status vote_status not null default 'draft',
  approval_rule approval_rule not null default 'simple_majority',
  -- threshold بين 0 و 1 (مثلاً 0.75 = 75%)؛ مطلوب فقط عند custom
  custom_threshold numeric(4, 3) check (custom_threshold is null or (custom_threshold > 0 and custom_threshold <= 1)),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_vote_dates check (ends_at > starts_at),
  constraint chk_vote_custom_threshold
    check (approval_rule <> 'custom' or custom_threshold is not null),
  -- Composite unique for tenant-consistent FK from vote_responses and decisions.
  constraint votes_id_building_unique unique (id, building_id),
  -- Tenant-consistent FK to suggestions (PG15+ partial set null).
  constraint fk_votes_suggestion_tenant
    foreign key (suggestion_id, building_id)
    references public.suggestions(id, building_id)
    on delete set null (suggestion_id)
);

create index idx_votes_building on public.votes(building_id);
create index idx_votes_status on public.votes(building_id, status);
create index idx_votes_ends_at on public.votes(building_id, ends_at);
create index idx_votes_suggestion on public.votes(suggestion_id);

-- =============================================
-- TABLE 13/17: vote_options
-- =============================================
create table public.vote_options (
  id uuid primary key default gen_random_uuid(),
  vote_id uuid not null references public.votes(id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  -- Composite unique so vote_responses can FK (option_id, vote_id) → vote_options(id, vote_id),
  -- guaranteeing the chosen option belongs to the specified vote.
  constraint vote_options_id_vote_unique unique (id, vote_id)
);

create index idx_vote_options_vote on public.vote_options(vote_id);

-- =============================================
-- TABLE 14/17: vote_responses
-- §1.5.2: per-apartment فقط — apartment_id NOT NULL + unique (vote_id, apartment_id)
-- =============================================
create table public.vote_responses (
  id uuid primary key default gen_random_uuid(),
  -- Inline FKs replaced with composite FKs below to enforce both:
  --   (1) option_id belongs to the specified vote_id, and
  --   (2) tenant consistency: vote and apartment are in the same building.
  vote_id uuid not null,
  option_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- §1.5.2: NOT NULL — التصويت دائماً باسم شقة
  apartment_id uuid not null,
  -- Explicit building_id for tenant-consistent composite FKs.
  building_id uuid not null references public.buildings(id) on delete cascade,
  created_at timestamptz not null default now(),

  -- §1.5.2: لا يجوز للشقة إرسال أكثر من صوت واحد على نفس التصويت
  constraint uq_vote_per_apartment unique (vote_id, apartment_id),
  -- The chosen option must belong to the specified vote (closes Issue #2).
  constraint fk_vote_response_option_vote
    foreign key (option_id, vote_id)
    references public.vote_options(id, vote_id)
    on delete cascade,
  -- Vote must be in the specified building (closes Issue #1, tenant).
  constraint fk_vote_response_vote_tenant
    foreign key (vote_id, building_id)
    references public.votes(id, building_id)
    on delete cascade,
  -- Apartment must be in the specified building (closes Issue #1, tenant).
  constraint fk_vote_response_apartment_tenant
    foreign key (apartment_id, building_id)
    references public.apartments(id, building_id)
    on delete cascade
);

create index idx_vote_responses_vote on public.vote_responses(vote_id);
create index idx_vote_responses_user on public.vote_responses(user_id);
create index idx_vote_responses_option on public.vote_responses(option_id);
create index idx_vote_responses_apartment on public.vote_responses(apartment_id);
create index idx_vote_responses_building on public.vote_responses(building_id);

-- =============================================
-- TABLE 15/17: decisions
-- =============================================
create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  title text not null,
  description text,
  -- Nullable; composite FKs below enforce tenant when present.
  vote_id uuid,
  expense_id uuid,
  status decision_status not null default 'approved',
  decision_date date not null default current_date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  -- Tenant-consistent composite FKs.
  constraint fk_decisions_vote_tenant
    foreign key (vote_id, building_id)
    references public.votes(id, building_id)
    on delete set null (vote_id),
  constraint fk_decisions_expense_tenant
    foreign key (expense_id, building_id)
    references public.expenses(id, building_id)
    on delete set null (expense_id)
);

create index idx_decisions_building on public.decisions(building_id);
create index idx_decisions_vote on public.decisions(vote_id);
create index idx_decisions_expense on public.decisions(expense_id);

-- =============================================
-- TABLE 16/17: documents
-- =============================================
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  title text not null,
  category text,
  file_url text not null,
  file_size integer check (file_size is null or file_size > 0),
  uploaded_by uuid references auth.users(id) on delete set null,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_documents_building on public.documents(building_id);
create index idx_documents_category on public.documents(building_id, category);

-- =============================================
-- TABLE 17/17: audit_logs
-- (immutable; UPDATE/DELETE forbidden via missing policies)
-- =============================================
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  building_id uuid references public.buildings(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  notes text,
  created_at timestamptz not null default now()
);

create index idx_audit_building on public.audit_logs(building_id);
create index idx_audit_entity on public.audit_logs(entity_type, entity_id);
create index idx_audit_actor on public.audit_logs(actor_id);
create index idx_audit_created on public.audit_logs(created_at desc);

-- End 01_schema.sql — 17 tables, 17 enums.
