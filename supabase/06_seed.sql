-- =============================================
-- 06_seed.sql — Test Data (DEVELOPMENT ONLY)
-- =============================================
-- ⚠️ تحذير: لا تشغل في الإنتاج. كل المستخدمين بكلمة مرور موحدة "password123".
-- يفترض تشغيله في SQL Editor (يستخدم service_role) أو via psql with service role.
-- =============================================

-- pgcrypto is required for crypt() password hashing below.
create extension if not exists "pgcrypto";

-- =============================================
-- Helper function (drop at end): create test user with auth.users + auth.identities
-- =============================================
create or replace function public._seed_create_user(
  p_id uuid,
  p_email text,
  p_password text,
  p_full_name text,
  p_phone text
) returns void
language plpgsql
as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, email_change_token_new, email_change_token_current, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000'::uuid,
    p_id, 'authenticated', 'authenticated', p_email,
    crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_full_name, 'phone', p_phone),
    now(), now(), '', '', '', ''
  ) on conflict (id) do nothing;

  insert into auth.identities (
    provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    p_id::text, p_id,
    jsonb_build_object('sub', p_id::text, 'email', p_email),
    'email', now(), now(), now()
  ) on conflict (provider, provider_id) do nothing;
end;
$$;

-- =============================================
-- 1. Test users (handle_new_user trigger creates profiles)
-- =============================================
select public._seed_create_user(
  '11111111-1111-1111-1111-111111111111'::uuid,
  'super@imarah.test', 'password123',
  'المالك (Super Admin)', '+966500000000'
);
select public._seed_create_user(
  '22222222-2222-2222-2222-222222222222'::uuid,
  'admin1@imarah.test', 'password123',
  'أحمد المدير', '+966500000001'
);
select public._seed_create_user(
  '33333333-3333-3333-3333-333333333333'::uuid,
  'treasurer1@imarah.test', 'password123',
  'خالد أمين الصندوق', '+966500000002'
);
select public._seed_create_user(
  '44444444-4444-4444-4444-444444444444'::uuid,
  'committee1@imarah.test', 'password123',
  'محمد عضو اللجنة', '+966500000003'
);
select public._seed_create_user(
  '55555555-5555-5555-5555-555555555555'::uuid,
  'resident1@imarah.test', 'password123',
  'عبدالله الساكن', '+966500000004'
);
select public._seed_create_user(
  '66666666-6666-6666-6666-666666666666'::uuid,
  'resident2@imarah.test', 'password123',
  'سعد الساكن', '+966500000005'
);
select public._seed_create_user(
  '77777777-7777-7777-7777-777777777777'::uuid,
  'technician1@imarah.test', 'password123',
  'يوسف الفني', '+966500000006'
);

-- =============================================
-- 2. Mark super admin (profile auto-created by handle_new_user trigger)
-- =============================================
update public.profiles set is_super_admin = true
where id = '11111111-1111-1111-1111-111111111111';

-- =============================================
-- 3. Buildings (2)
-- =============================================
insert into public.buildings (
  id, name, address, city, total_apartments, default_monthly_fee, currency,
  subscription_plan, subscription_status, created_by
) values
  (
    'a0000001-0000-0000-0000-000000000001'::uuid,
    'عمارة النور', 'حي العليا، الرياض', 'الرياض',
    6, 1500, 'SAR',
    'trial', 'trial',
    '22222222-2222-2222-2222-222222222222'::uuid
  ),
  (
    'a0000002-0000-0000-0000-000000000002'::uuid,
    'برج السلام', 'حي الشاطئ، جدة', 'جدة',
    4, 2000, 'SAR',
    'basic', 'active',
    '22222222-2222-2222-2222-222222222222'::uuid
  )
on conflict (id) do nothing;

-- =============================================
-- 4. Memberships
-- =============================================
insert into public.building_memberships (building_id, user_id, role) values
  -- Building 1: عمارة النور (full team)
  ('a0000001-0000-0000-0000-000000000001'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, 'admin'),
  ('a0000001-0000-0000-0000-000000000001'::uuid, '33333333-3333-3333-3333-333333333333'::uuid, 'treasurer'),
  ('a0000001-0000-0000-0000-000000000001'::uuid, '44444444-4444-4444-4444-444444444444'::uuid, 'committee'),
  ('a0000001-0000-0000-0000-000000000001'::uuid, '55555555-5555-5555-5555-555555555555'::uuid, 'resident'),
  ('a0000001-0000-0000-0000-000000000001'::uuid, '66666666-6666-6666-6666-666666666666'::uuid, 'resident'),
  ('a0000001-0000-0000-0000-000000000001'::uuid, '77777777-7777-7777-7777-777777777777'::uuid, 'technician'),
  -- Building 2: برج السلام (admin only — used to test super_admin cross-building access)
  ('a0000002-0000-0000-0000-000000000002'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, 'admin')
on conflict (building_id, user_id) do nothing;

-- =============================================
-- 5. Apartments (10 total)
-- =============================================
insert into public.apartments (id, building_id, number, floor, monthly_fee, status) values
  -- Building 1: عمارة النور (6 apts)
  ('aa000101-0000-0000-0000-000000000101'::uuid, 'a0000001-0000-0000-0000-000000000001'::uuid, '101', 1, 1500, 'occupied'),
  ('aa000102-0000-0000-0000-000000000102'::uuid, 'a0000001-0000-0000-0000-000000000001'::uuid, '102', 1, 1500, 'occupied'),
  ('aa000103-0000-0000-0000-000000000103'::uuid, 'a0000001-0000-0000-0000-000000000001'::uuid, '103', 1, 1500, 'vacant'),
  ('aa000201-0000-0000-0000-000000000201'::uuid, 'a0000001-0000-0000-0000-000000000001'::uuid, '201', 2, 1500, 'occupied'),
  ('aa000202-0000-0000-0000-000000000202'::uuid, 'a0000001-0000-0000-0000-000000000001'::uuid, '202', 2, 1500, 'vacant'),
  ('aa000203-0000-0000-0000-000000000203'::uuid, 'a0000001-0000-0000-0000-000000000001'::uuid, '203', 2, 1500, 'vacant'),
  -- Building 2: برج السلام (4 apts)
  ('bb000101-0000-0000-0000-000000000101'::uuid, 'a0000002-0000-0000-0000-000000000002'::uuid, '101', 1, 2000, 'vacant'),
  ('bb000102-0000-0000-0000-000000000102'::uuid, 'a0000002-0000-0000-0000-000000000002'::uuid, '102', 1, 2000, 'vacant'),
  ('bb000103-0000-0000-0000-000000000103'::uuid, 'a0000002-0000-0000-0000-000000000002'::uuid, '103', 2, 2000, 'vacant'),
  ('bb000104-0000-0000-0000-000000000104'::uuid, 'a0000002-0000-0000-0000-000000000002'::uuid, '104', 2, 2000, 'vacant')
on conflict (id) do nothing;

-- =============================================
-- 6. Apartment members + voting reps
-- (Resident1 = owner of apt 101, voting rep)
-- (Resident2 = tenant of apt 102, voting rep — only member, so auto)
-- (apt 201: admin1 owns it, also voting rep)
-- =============================================
insert into public.apartment_members (
  building_id, apartment_id, user_id, relation_type, is_voting_representative
) values
  (
    'a0000001-0000-0000-0000-000000000001'::uuid,
    'aa000101-0000-0000-0000-000000000101'::uuid,
    '55555555-5555-5555-5555-555555555555'::uuid,
    'owner', true
  ),
  (
    'a0000001-0000-0000-0000-000000000001'::uuid,
    'aa000102-0000-0000-0000-000000000102'::uuid,
    '66666666-6666-6666-6666-666666666666'::uuid,
    'resident', true
  ),
  (
    'a0000001-0000-0000-0000-000000000001'::uuid,
    'aa000201-0000-0000-0000-000000000201'::uuid,
    '22222222-2222-2222-2222-222222222222'::uuid,
    'owner', true
  )
on conflict (apartment_id, user_id, relation_type) do nothing;

-- =============================================
-- 7. Vendors
-- =============================================
insert into public.vendors (id, building_id, name, phone, specialty, rating) values
  (
    'c0000001-0000-0000-0000-000000000001'::uuid,
    'a0000001-0000-0000-0000-000000000001'::uuid,
    'مؤسسة الأمل للسباكة', '+966512345678', 'سباكة', 4.5
  ),
  (
    'c0000002-0000-0000-0000-000000000002'::uuid,
    'a0000001-0000-0000-0000-000000000001'::uuid,
    'كهرباء النجاح', '+966512345679', 'كهرباء', 4.0
  )
on conflict (id) do nothing;

-- =============================================
-- 8. Payments (3: approved, pending, rejected)
-- §1.5.1: every payment has receipt_url; rejected has rejection_reason
-- =============================================
-- approved
insert into public.payments (
  id, building_id, apartment_id, user_id, amount, payment_date, period_month,
  method, status, receipt_url, created_by, approved_by, approved_at
) values (
  'd0000001-0000-0000-0000-000000000001'::uuid,
  'a0000001-0000-0000-0000-000000000001'::uuid,
  'aa000101-0000-0000-0000-000000000101'::uuid,
  '55555555-5555-5555-5555-555555555555'::uuid,
  1500, '2026-04-05', '2026-04-01',
  'bank_transfer', 'approved',
  'a0000001-0000-0000-0000-000000000001/payments/d0000001/receipt.jpg',
  '55555555-5555-5555-5555-555555555555'::uuid,
  '33333333-3333-3333-3333-333333333333'::uuid,
  '2026-04-06 10:00:00+03'
) on conflict (id) do nothing;

-- pending
insert into public.payments (
  id, building_id, apartment_id, user_id, amount, payment_date, period_month,
  method, status, receipt_url, created_by
) values (
  'd0000002-0000-0000-0000-000000000002'::uuid,
  'a0000001-0000-0000-0000-000000000001'::uuid,
  'aa000102-0000-0000-0000-000000000102'::uuid,
  '66666666-6666-6666-6666-666666666666'::uuid,
  1500, '2026-04-15', '2026-04-01',
  'cash', 'pending',
  'a0000001-0000-0000-0000-000000000001/payments/d0000002/receipt.jpg',
  '66666666-6666-6666-6666-666666666666'::uuid
) on conflict (id) do nothing;

-- rejected (with reason — required by CHECK)
insert into public.payments (
  id, building_id, apartment_id, user_id, amount, payment_date, period_month,
  method, status, receipt_url, rejection_reason, created_by
) values (
  'd0000003-0000-0000-0000-000000000003'::uuid,
  'a0000001-0000-0000-0000-000000000001'::uuid,
  'aa000201-0000-0000-0000-000000000201'::uuid,
  '22222222-2222-2222-2222-222222222222'::uuid,
  1500, '2026-04-10', '2026-03-01',
  'online', 'rejected',
  'a0000001-0000-0000-0000-000000000001/payments/d0000003/receipt.jpg',
  'الإيصال غير واضح، يرجى إعادة الرفع بجودة أعلى',
  '22222222-2222-2222-2222-222222222222'::uuid
) on conflict (id) do nothing;

-- =============================================
-- 9. Expenses
-- =============================================
-- Note: this row is inserted as 'paid' under the schema as it exists in
-- 01_schema.sql (no paid_by/paid_at columns yet). The Phase 7 migration
-- (10_phase7.sql) adds those columns AND backfills this row's proof fields
-- BEFORE adding chk_expenses_paid_proof, so the full pipeline is consistent.
insert into public.expenses (
  id, building_id, title, description, category, amount, expense_date,
  status, vendor_id, created_by, approved_by, approved_at
) values (
  'e0000001-0000-0000-0000-000000000001'::uuid,
  'a0000001-0000-0000-0000-000000000001'::uuid,
  'صيانة المصعد الشهرية', 'عقد صيانة دورية للمصعد', 'صيانة',
  800, '2026-04-01', 'paid',
  null,
  '33333333-3333-3333-3333-333333333333'::uuid,
  '22222222-2222-2222-2222-222222222222'::uuid,
  '2026-04-02 09:00:00+03'
) on conflict (id) do nothing;

insert into public.expenses (
  id, building_id, title, description, category, amount, expense_date,
  status, vendor_id, created_by
) values (
  'e0000002-0000-0000-0000-000000000002'::uuid,
  'a0000001-0000-0000-0000-000000000001'::uuid,
  'إصلاح تسرب الماء (شقة 201)', 'تسرب من السقف', 'سباكة',
  350, '2026-04-12', 'pending_review',
  'c0000001-0000-0000-0000-000000000001'::uuid,
  '33333333-3333-3333-3333-333333333333'::uuid
) on conflict (id) do nothing;

-- =============================================
-- 10. Maintenance Requests
-- =============================================
insert into public.maintenance_requests (
  id, building_id, apartment_id, requested_by, assigned_to, title, description,
  location_type, priority, status, completed_at
) values (
  'f0000001-0000-0000-0000-000000000001'::uuid,
  'a0000001-0000-0000-0000-000000000001'::uuid,
  'aa000201-0000-0000-0000-000000000201'::uuid,
  '22222222-2222-2222-2222-222222222222'::uuid,
  '77777777-7777-7777-7777-777777777777'::uuid,
  'تسرب من السقف', 'تسرب صغير من سقف الحمام',
  'apartment', 'high', 'completed',
  '2026-04-13 14:00:00+03'
) on conflict (id) do nothing;

insert into public.maintenance_requests (
  id, building_id, requested_by, title, description,
  location_type, priority, status
) values (
  'f0000002-0000-0000-0000-000000000002'::uuid,
  'a0000001-0000-0000-0000-000000000001'::uuid,
  '55555555-5555-5555-5555-555555555555'::uuid,
  'لمبة المدخل لا تعمل', 'لمبة عند المدخل الرئيسي تحترق منذ يومين',
  'entrance', 'medium', 'new'
) on conflict (id) do nothing;

-- =============================================
-- 11. Tasks
-- =============================================
insert into public.tasks (
  id, building_id, title, description, assigned_to, status, priority, due_date, created_by
) values (
  '10000001-0000-0000-0000-000000000001'::uuid,
  'a0000001-0000-0000-0000-000000000001'::uuid,
  'تجديد عقد صيانة المصعد', 'العقد الحالي ينتهي نهاية الشهر',
  '22222222-2222-2222-2222-222222222222'::uuid,
  'todo', 'high', '2026-04-30',
  '44444444-4444-4444-4444-444444444444'::uuid
) on conflict (id) do nothing;

-- =============================================
-- 12. Suggestion + Vote + Options + 1 Response
-- =============================================
insert into public.suggestions (
  id, building_id, title, description, created_by, status
) values (
  '20000001-0000-0000-0000-000000000001'::uuid,
  'a0000001-0000-0000-0000-000000000001'::uuid,
  'تركيب كاميرات مراقبة على المدخل',
  'لتعزيز الأمن لجميع السكان',
  '55555555-5555-5555-5555-555555555555'::uuid,
  'converted_to_vote'
) on conflict (id) do nothing;

insert into public.votes (
  id, building_id, title, description, suggestion_id, estimated_cost,
  starts_at, ends_at, status, approval_rule, created_by
) values (
  '30000001-0000-0000-0000-000000000001'::uuid,
  'a0000001-0000-0000-0000-000000000001'::uuid,
  'تركيب كاميرات مراقبة على المدخل',
  'الكاميرات بتكلفة ٣٬٠٠٠ ر.س. هل توافقون؟',
  '20000001-0000-0000-0000-000000000001'::uuid,
  3000,
  now() - interval '1 day',
  now() + interval '7 days',
  'active', 'simple_majority',
  '44444444-4444-4444-4444-444444444444'::uuid
) on conflict (id) do nothing;

insert into public.vote_options (id, vote_id, label, sort_order) values
  (
    '40000001-0000-0000-0000-000000000001'::uuid,
    '30000001-0000-0000-0000-000000000001'::uuid,
    'نعم، أوافق', 1
  ),
  (
    '40000002-0000-0000-0000-000000000002'::uuid,
    '30000001-0000-0000-0000-000000000001'::uuid,
    'لا، أرفض', 2
  )
on conflict (id) do nothing;

-- One apartment voted (apt 101 via resident1 the voting rep)
-- building_id ضروري لـ tenant-consistent composite FKs.
insert into public.vote_responses (
  id, vote_id, option_id, user_id, apartment_id, building_id
) values (
  '50000001-0000-0000-0000-000000000001'::uuid,
  '30000001-0000-0000-0000-000000000001'::uuid,
  '40000001-0000-0000-0000-000000000001'::uuid,
  '55555555-5555-5555-5555-555555555555'::uuid,
  'aa000101-0000-0000-0000-000000000101'::uuid,
  'a0000001-0000-0000-0000-000000000001'::uuid
) on conflict (vote_id, apartment_id) do nothing;

-- =============================================
-- Drop the seed helper function
-- =============================================
drop function public._seed_create_user(uuid, text, text, text, text);

-- =============================================
-- Summary (printed via NOTICE)
-- =============================================
do $$
begin
  raise notice '====== SEED DATA SUMMARY ======';
  raise notice 'كل المستخدمين بكلمة مرور: password123';
  raise notice 'Test users:';
  raise notice '  super@imarah.test          → Super Admin';
  raise notice '  admin1@imarah.test         → Admin (في عمارة النور + برج السلام، voting rep لشقة 201)';
  raise notice '  treasurer1@imarah.test     → Treasurer (عمارة النور)';
  raise notice '  committee1@imarah.test     → Committee (عمارة النور)';
  raise notice '  resident1@imarah.test      → Resident, شقة 101 (voting rep)';
  raise notice '  resident2@imarah.test      → Resident, شقة 102 (voting rep)';
  raise notice '  technician1@imarah.test    → Technician (عمارة النور)';
  raise notice '';
  raise notice 'Buildings: 2 (عمارة النور trial, برج السلام basic active)';
  raise notice 'Apartments: 10 (6 + 4)';
  raise notice 'Voting reps: 3 (apt 101, 102, 201)';
  raise notice 'Sample financials: 3 payments (approved/pending/rejected), 2 expenses';
  raise notice 'Sample governance: 1 suggestion → 1 active vote with 1 response';
end $$;

-- End 06_seed.sql
