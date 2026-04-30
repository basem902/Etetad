-- =============================================
-- 17_phase16.sql — Phase 16 (Marketing + Pricing + Public Subscription Requests)
-- =============================================
-- يطبَّق بعد 16_phase14.sql.
-- يُضيف:
--   1. subscription_tiers — جدول الباقات (يَقرأه /pricing)
--   2. platform_settings — جدول إعدادات key/value (بيانات بنك + VAT)
--   3. subscription_requests — نموذج CRM للتواصل العام
--   + RLS: anon = SELECT على tiers فقط، INSERT على requests فقط
--   + seed لـ 4 باقات افتراضية + bank_account placeholder + vat_rate
-- =============================================

-- =============================================
-- (1) subscription_tiers — الباقات
-- =============================================
-- الباقات المعروضة في /pricing. anon يَقرؤها (للسعر العام). super_admin
-- يُحدِّثها (يَعرض/يَخفي باقات، يُغيِّر السعر، يُضيف باقة جديدة).
--
-- لا composite FK هنا لأنها reference table (لا tenant). is_active يَحجبها من
-- /pricing بدون حذف (يَحفظ orders قائمة في Phase 18 — درس #11 snapshot).
-- =============================================

create table if not exists public.subscription_tiers (
  id text primary key,                                  -- 'trial' | 'basic' | 'pro' | 'enterprise'
  name text not null,                                   -- "تجريبية" | "أساسية" | "احترافية" | "مؤسسات"
  description text,                                     -- وصف قصير لـ /pricing
  price_monthly numeric(10,2),                          -- بـ SAR، null للـ trial
  price_yearly numeric(10,2),                           -- مع خصم سنوي
  max_apartments int,                                   -- 10 | 30 | 100 | null=unlimited
  max_admins int,                                       -- عدد admins المسموح
  features jsonb not null default '[]'::jsonb,          -- ["قبول مدفوعات", "تقارير شهرية", ...]
  is_active boolean not null default true,              -- false = مَخفية من /pricing
  sort_order int not null default 0,                    -- ترتيب العرض
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- إذا كانت الباقة tier=trial، يجب أن price_monthly + price_yearly = NULL
  -- (المنطق التشغيلي: trial دائماً مجاني)
  check (id <> 'trial' or (price_monthly is null and price_yearly is null)),
  -- باقات غير trial يجب أن يكون لها سعر شهري على الأقل
  check (id = 'trial' or price_monthly is not null)
);

-- updated_at trigger (يَستخدم الـ helper من Phase 1 إن وُجد، وإلا inline)
create or replace function public.set_updated_at_subscription_tiers()
returns trigger language plpgsql as $$
begin NEW.updated_at = now(); return NEW; end;
$$;

drop trigger if exists trg_subscription_tiers_updated_at on public.subscription_tiers;
create trigger trg_subscription_tiers_updated_at
  before update on public.subscription_tiers
  for each row execute function public.set_updated_at_subscription_tiers();

-- RLS: anon + authenticated يَقرؤون (كلهم يَزورون /pricing). super_admin يُعدِّل.
alter table public.subscription_tiers enable row level security;

drop policy if exists "tiers_select_all" on public.subscription_tiers;
create policy "tiers_select_all"
  on public.subscription_tiers for select
  to anon, authenticated
  using (is_active = true or public.is_super_admin());

drop policy if exists "tiers_modify_super" on public.subscription_tiers;
create policy "tiers_modify_super"
  on public.subscription_tiers for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Seed: 4 باقات افتراضية. super_admin يُعدِّل لاحقاً عبر UI (Phase 16) أو SQL.
insert into public.subscription_tiers
  (id, name, description, price_monthly, price_yearly, max_apartments, max_admins, features, sort_order)
values
  ('trial',
   'تجريبية',
   'تجربة مَجانية لمدة 30 يوماً بكل المزايا. لا حاجة لبطاقة ائتمان.',
   null, null,
   10, 1,
   '["كل المزايا لمدة 30 يوماً", "حتى 10 شقق", "admin واحد"]'::jsonb,
   1),
  ('basic',
   'أساسية',
   'للعمارات الصغيرة. مدفوعات + صيانة + تقارير شهرية.',
   49.00, 490.00,
   30, 2,
   '["حتى 30 شقة", "2 admins", "مدفوعات + صيانة", "تقارير شهرية", "audit logs 90 يوماً"]'::jsonb,
   2),
  ('pro',
   'احترافية',
   'الأكثر شيوعاً. كل المزايا للعمارات المتوسطة.',
   149.00, 1490.00,
   100, 5,
   '["حتى 100 شقة", "5 admins", "كل المزايا", "تقارير شهرية + سنوية", "تصويتات + قرارات", "audit logs كاملة", "PWA + offline"]'::jsonb,
   3),
  ('enterprise',
   'مؤسسات',
   'للمجمَّعات الكبرى. غير محدود + دعم مُخصَّص.',
   499.00, 4990.00,
   null, null,
   '["شقق غير محدودة", "admins غير محدود", "تقارير مُخصَّصة", "دعم مباشر", "SLA"]'::jsonb,
   4)
on conflict (id) do nothing;

-- =============================================
-- (2) platform_settings — key/value settings
-- =============================================
-- إعدادات عامة مَركزية (بيانات البنك، VAT، email config، ...). super_admin
-- فقط يَقرأ/يُعدِّل (بيانات بنكية حساس). anon = 0 access.
--
-- لماذا key/value JSONB بدلاً من أعمدة مُحدَّدة؟ مَرونة — Phase 18 سيُضيف
-- مفاتيح جديدة بدون migration.
-- =============================================

create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at_platform_settings()
returns trigger language plpgsql as $$
begin NEW.updated_at = now(); return NEW; end;
$$;

drop trigger if exists trg_platform_settings_updated_at on public.platform_settings;
create trigger trg_platform_settings_updated_at
  before update on public.platform_settings
  for each row execute function public.set_updated_at_platform_settings();

-- RLS: super_admin only (بيانات حساس)
alter table public.platform_settings enable row level security;

drop policy if exists "settings_select_super" on public.platform_settings;
create policy "settings_select_super"
  on public.platform_settings for select
  to authenticated
  using (public.is_super_admin());

drop policy if exists "settings_modify_super" on public.platform_settings;
create policy "settings_modify_super"
  on public.platform_settings for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Seed: قيم placeholder، super_admin يُعدِّلها عبر UI قبل الإطلاق.
insert into public.platform_settings (key, value, description) values
  ('bank_account',
   '{
     "bank_name": "غير مُكوَّن",
     "account_holder": "غير مُكوَّن",
     "iban": "",
     "account_number": ""
   }'::jsonb,
   'بيانات الحساب البنكي للتحويلات (تُعرض في Phase 18 /subscribe). super_admin يُعدِّلها عبر /super-admin/settings.'),
  ('vat_rate',
   '0.15'::jsonb,
   'نسبة ضريبة القيمة المضافة في KSA (15%). يُستخدم في Phase 18 لحساب total_amount.'),
  ('vat_enabled',
   'false'::jsonb,
   'هل نُحسِّب VAT على subscription_orders؟ يُفعَّل بعد تسجيل ضريبي رسمي.')
on conflict (key) do nothing;

-- =============================================
-- (3) subscription_requests — CRM contact form
-- =============================================
-- نموذج /contact في /marketing. **NO anon direct INSERT** (v3.32 round 4):
-- anon يَملك anon-key في bundle المتصفح، فأي direct PostgREST INSERT يَتجاوز
-- rate limit في server action. لذلك:
--   - INSERT حصراً عبر submit_contact_request() RPC (server-only، GRANT لـ
--     service_role فقط). انظر القسم (5b) أدناه.
--   - server action في src/actions/marketing.ts يَستدعيه عبر createAdminClient()
--     بعد rate limit + Zod validation.
--   - super_admin يَقرأ ويُتابع عبر RLS الموجودة أدناه.
--
-- honeypot column: defense layer 3 (CHECK constraint) — لو RPC تَجاوز validation،
-- الـ table نفسه يَرفض. layers 1+2 في server action (Zod) و RPC (length+honeypot).
--
-- لا rate limit في DB (HTTP layer وحده يَعرف IP — درس #20).
-- =============================================

create table if not exists public.subscription_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  phone text,
  building_name text not null,
  city text,
  estimated_apartments int,
  interested_tier text references public.subscription_tiers(id),
  message text,
  honeypot text,                                    -- يجب أن يَبقى NULL/فارغاً
  status text not null default 'new'
    check (status in ('new', 'contacted', 'qualified', 'closed_won', 'closed_lost')),
  notes text,                                       -- super_admin internal notes
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),

  -- Validation
  check (length(email) >= 5 and email like '%@%'),
  check (length(full_name) >= 2),
  check (length(building_name) >= 2),
  check (estimated_apartments is null or estimated_apartments > 0),
  -- honeypot: bot detection — يجب أن يَكون NULL
  check (honeypot is null or honeypot = '')
);

-- v3.32 (Codex round 4 P2): NO direct anon INSERT.
-- ===========================================================
-- في rounds 2/3 كان anon يَستطيع INSERT مباشر عبر PostgREST، متجاوزاً rate
-- limit الذي يَعيش في server action. الـ anon key مَعروض في bundle المتصفح،
-- فأي مهاجم يَستطيع سَنبر `POST /rest/v1/subscription_requests` بأي عدد.
--
-- الإصلاح: إغلاق INSERT للـ anon نهائياً، وإجبار كل المسار العام عبر
-- `submit_contact_request()` RPC (أدناه)، الذي:
--   - GRANT حصرياً لـ service_role (لا anon، لا authenticated)
--   - يَفرض كل القيود داخلياً (length، honeypot، status, ...)
--   - يُستدعى من server action عبر admin client narrow scope
--
-- النتيجة: choke point واحد = الـ action (مع IP rate limit) = الـ RPC
-- (مع DB validation). لا bypass ممكن.
-- ===========================================================
alter table public.subscription_requests enable row level security;

-- DROP السياسة القديمة — INSERT لم يَعد مَفتوحاً للـ anon
drop policy if exists "requests_insert_anon" on public.subscription_requests;

drop policy if exists "requests_select_super" on public.subscription_requests;
create policy "requests_select_super"
  on public.subscription_requests for select
  to authenticated
  using (public.is_super_admin());

drop policy if exists "requests_update_super" on public.subscription_requests;
create policy "requests_update_super"
  on public.subscription_requests for update
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "requests_delete_super" on public.subscription_requests;
create policy "requests_delete_super"
  on public.subscription_requests for delete
  to authenticated
  using (public.is_super_admin());

-- Index على status للـ filters في /super-admin/requests
create index if not exists idx_subscription_requests_status_created
  on public.subscription_requests (status, created_at desc);

-- =============================================
-- (4) Workflow trigger على subscription_requests (audit immutability)
-- =============================================
-- created_at + email + full_name + building_name immutable بعد INSERT.
-- super_admin يُعدِّل status + notes + reviewed_by + reviewed_at فقط.
-- =============================================

-- v3.30 (Codex P2 #4): tighten — ALL submitter-provided fields are immutable.
-- super_admin only updates workflow fields (status, notes, reviewed_by,
-- reviewed_at). Any change to a submission field is treated as data
-- tampering and rejected.
create or replace function public.subscription_requests_validate_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- audit fields immutable
  if NEW.created_at is distinct from OLD.created_at then
    raise exception 'created_at is immutable on subscription_requests'
      using errcode = 'check_violation';
  end if;

  -- ALL submitter-provided fields are frozen post-INSERT (v3.30 fix).
  -- This includes: contact identifiers (email/full_name/phone), the building
  -- description (building_name/city/estimated_apartments/interested_tier/
  -- message), and the bot-detection field (honeypot). super_admin can ONLY
  -- update workflow fields (status, notes, reviewed_by, reviewed_at).
  if NEW.email is distinct from OLD.email
     or NEW.full_name is distinct from OLD.full_name
     or NEW.phone is distinct from OLD.phone
     or NEW.building_name is distinct from OLD.building_name
     or NEW.city is distinct from OLD.city
     or NEW.estimated_apartments is distinct from OLD.estimated_apartments
     or NEW.interested_tier is distinct from OLD.interested_tier
     or NEW.message is distinct from OLD.message
     or NEW.honeypot is distinct from OLD.honeypot then
    raise exception 'submission fields are immutable on subscription_requests'
      using errcode = 'check_violation';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_subscription_requests_validate_update on public.subscription_requests;
create trigger trg_subscription_requests_validate_update
  before update on public.subscription_requests
  for each row
  execute function public.subscription_requests_validate_update();

-- =============================================
-- (5) Helper RPC: get_active_subscription_tiers()
-- =============================================
-- /pricing يَستخدم هذا بدلاً من SELECT مباشر، يَضمن الترتيب الصحيح + الفلترة.
-- anon callable (لـ /pricing).
-- =============================================

create or replace function public.get_active_subscription_tiers()
returns table (
  id text,
  name text,
  description text,
  price_monthly numeric,
  price_yearly numeric,
  max_apartments int,
  max_admins int,
  features jsonb,
  sort_order int
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id, name, description, price_monthly, price_yearly,
         max_apartments, max_admins, features, sort_order
  from public.subscription_tiers
  where is_active = true
  order by sort_order asc, id asc;
$$;

grant execute on function public.get_active_subscription_tiers() to anon, authenticated;

-- =============================================
-- (5b) RPC: submit_contact_request(...) — server-only choke point للـ /contact
-- =============================================
-- v3.32 (Codex round 4 P2): إغلاق ثغرة direct anon INSERT.
--
-- الـ RPC تَفرض داخلياً:
--   - honeypot فارغ/null (defense layer 1، نفس CHECK constraint)
--   - length constraints على كل الحقول (defense-in-depth مع Zod في action)
--   - status='new' و reviewed_*=null forced (لا client choice)
--   - interested_tier ضمن whitelist
--
-- GRANT حصرياً لـ service_role. الـ server action في marketing.ts يَستدعيه
-- عبر createAdminClient(). anon لا يَستطيع استدعاءه مباشرةً عبر PostgREST.
--
-- الـ action layer يُضيف:
--   - rate limit بالـ IP (HTTP فقط — DB لا يَعرف IP، درس #20)
--   - Zod schema (UX-friendly errors قبل DB)
--   - email failure logging
-- =============================================

create or replace function public.submit_contact_request(
  p_full_name text,
  p_email text,
  p_phone text,
  p_building_name text,
  p_city text,
  p_estimated_apartments int,
  p_interested_tier text,
  p_message text,
  p_honeypot text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  -- (1) honeypot — bot detection (defense layer 1)
  if p_honeypot is not null and length(p_honeypot) > 0 then
    raise exception 'invalid submission' using errcode = 'check_violation';
  end if;

  -- (2) length + format validation (defense-in-depth — Zod is layer 1)
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

  -- (3) INSERT — status + reviewed_* hardcoded (لا client override)
  insert into public.subscription_requests (
    full_name, email, phone, building_name, city,
    estimated_apartments, interested_tier, message,
    honeypot, status
  ) values (
    p_full_name,
    p_email,
    nullif(p_phone, ''),
    p_building_name,
    nullif(p_city, ''),
    p_estimated_apartments,
    nullif(p_interested_tier, ''),
    nullif(p_message, ''),
    null,    -- honeypot forced — already validated empty above
    'new'    -- status forced
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- server-only — anon/authenticated لا يَستطيعون الاستدعاء عبر PostgREST
revoke execute on function public.submit_contact_request(
  text, text, text, text, text, int, text, text, text
) from public;
grant execute on function public.submit_contact_request(
  text, text, text, text, text, int, text, text, text
) to service_role;

-- =============================================
-- (6) Helper RPC: get_public_bank_details()
-- =============================================
-- في Phase 18 سَنحتاج anon access لبيانات البنك في صفحة /subscribe/[id].
-- في Phase 16: super_admin فقط (بيانات حساس).
--
-- v3.30 (Codex P2 #2): SECURITY DEFINER يَتجاوز RLS، فالـ GRANT للـ
-- authenticated وحده غير كافٍ (أي مستخدم مسجَّل سيَرى bank_account!).
-- نُضيف is_super_admin() check داخل الدالة كحماية فعلية. Phase 18 سيُغيِّر
-- هذا إلى token-validating RPC مرتبط بـ subscription_orders.
-- =============================================

create or replace function public.get_public_bank_details()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Access denied: super_admin only' using errcode = 'P0003';
  end if;
  return (select value from public.platform_settings where key = 'bank_account');
end;
$$;

grant execute on function public.get_public_bank_details() to authenticated;

-- =============================================
-- (7) RPC: log_email_failure(...)
-- =============================================
-- v3.30 (Codex P2 #3): graceful email failure يَجب أن يُسجَّل في audit_logs
-- ليَراه super_admin من /super-admin/audit. SECURITY DEFINER لأن audit_logs
-- INSERT عادةً عبر triggers — هذا path platform-level events (building_id NULL).
--
-- entity_type = 'subscription_request' أو 'subscription_order' (Phase 18 لاحقاً).
-- action = 'email_failure'.
-- new_values = { email_to, reason, email_kind } لـ debugging.
--
-- يُستدعى من server actions بعد Promise.allSettled على إرسال البريد. الـ
-- failure لا يَكسر العملية الأصلية (DB integrity = source of truth).
-- =============================================

create or replace function public.log_email_failure(
  p_entity_type text,
  p_entity_id uuid,
  p_email_to text,
  p_email_kind text,                -- 'notification' أو 'confirmation' أو ...
  p_reason text                     -- 'config_missing' أو 'send_failed: <err>'
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- whitelist لـ entity_type لتَجنُّب abuse من anon
  if p_entity_type not in ('subscription_request', 'subscription_order') then
    raise exception 'invalid entity_type for email failure log'
      using errcode = 'check_violation';
  end if;
  if p_email_kind not in ('notification', 'confirmation') then
    raise exception 'invalid email_kind' using errcode = 'check_violation';
  end if;

  insert into public.audit_logs (
    building_id,    -- NULL = platform-level event
    actor_id,       -- قد يَكون NULL للـ anon (contact form)
    action,
    entity_type,
    entity_id,
    notes,
    new_values
  ) values (
    null,
    auth.uid(),
    'email_failure',
    p_entity_type,
    p_entity_id,
    substring(p_reason from 1 for 500),  -- cap notes length
    jsonb_build_object(
      'email_to', p_email_to,
      'email_kind', p_email_kind,
      'reason_full', p_reason
    )
  );
end;
$$;

-- v3.31 (Codex P2): الـ RPC SERVER-ONLY. لا anon ولا authenticated.
-- audit_logs قاعدة المنصة الحساسة — لا INSERT من العملاء (الموجود trigger-only).
-- الـ server action يَستدعيه عبر service_role admin client بعد INSERT العميل.
-- هذا يَمنع anon abuse (audit spam، تَضخيم الجدول خارج rate limit).
revoke execute on function public.log_email_failure(text, uuid, text, text, text)
  from public;
grant execute on function public.log_email_failure(text, uuid, text, text, text)
  to service_role;

-- End 17_phase16.sql
