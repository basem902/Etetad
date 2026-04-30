# Supabase Setup — كل ملفات SQL

تطبيق ملفات SQL على مشروع Supabase بالترتيب الموضّح أدناه. التطبيق إلزامي بالترتيب — كل ملف يَفترض الذي قبله.

> **للنشر للإنتاج**، انظر [DEPLOYMENT.md](../DEPLOYMENT.md). هذا الـ README للتفاصيل التقنية + الاختبارات الأمنية.

## المتطلبات

- مشروع Supabase (cloud أو local عبر `supabase start`)
- مفاتيح المشروع: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

## التطبيق

### الطريقة 1: Supabase Studio (الأسهل)

1. افتح Supabase Studio لمشروعك
2. **SQL Editor** → نفّذ الملفات بالترتيب التالي

### الطريقة 2: Supabase CLI / psql

```bash
for f in 01_schema 02_functions 03_triggers 04_policies 05_storage \
         07_phase2 08_phase5 09_phase6 10_phase7 11_phase8 \
         12_phase9 13_phase10 14_phase11 15_phase12 16_phase14; do
  psql "$DATABASE_URL" -f "supabase/$f.sql"
done

# Seed (تطوير فقط — لا تَنشره في الإنتاج)
psql "$DATABASE_URL" -f supabase/06_seed.sql
```

## ملفات SQL — الترتيب والمحتوى

| # | الملف | المرحلة | المحتوى الرئيسي |
|---|---|---|---|
| 1 | `01_schema.sql` | 1 | 17 جدولاً + 17 ENUMs + composite FKs + indexes + CHECK |
| 2 | `02_functions.sql` | 1 | RLS helpers: `is_super_admin`, `is_building_member`, `user_has_role`, `user_building_ids` |
| 3 | `03_triggers.sql` | 1 | `updated_at` لكل جدول + `handle_new_user` + audit triggers |
| 4 | `04_policies.sql` | 1 | RLS لكل الـ 17 جدولاً |
| 5 | `05_storage.sql` | 1 | 6 buckets (avatars, logos, receipts, invoices, maintenance, documents) + storage policies |
| 6 | `06_seed.sql` | 1 | بيانات تجريبية — **تطوير فقط** |
| 7 | `07_phase2.sql` | 2 | حذف bootstrap policy + `register_building()` SECURITY DEFINER |
| 8 | `08_phase5.sql` | 5 | 3 RPCs لإدارة apartment_members (link/change-rep/deactivate) |
| 9 | `09_phase6.sql` | 6 | payments_insert WITH CHECK + receipts_delete_own_orphan |
| 10 | `10_phase7.sql` | 7 | expenses workflow trigger + paid_by/paid_at + chk_expenses_paid_proof |
| 11 | `11_phase8.sql` | 8 | maintenance + tasks tables + workflow + private linking schema |
| 12 | `12_phase9.sql` | 9 | vendors tenant lock |
| 13 | `13_phase10.sql` | 10 | Governance: suggestions/votes/decisions + 5 RPCs + 4 triggers |
| 14 | `14_phase11.sql` | 11 | documents table + storage row-scope + audit immutability |
| 15 | `15_phase12.sql` | 12 | 4 financial-report RPCs (monthly/yearly/range/breakdown) |
| 16 | `16_phase14.sql` | 14 | super-admin: subscription workflow + 4 RPCs + is_building_active_subscription helper |

> **المرحلة 13 (PWA)** لا يَحتاج SQL — كل تَغييراتها client-side.

## بيانات seed (للتطوير فقط)

كل المستخدمين بكلمة مرور موحَّدة: **`password123`**

| البريد | الدور | الموقع |
|---|---|---|
| `super@imarah.test` | Super Admin | يرى كل العمارات |
| `admin1@imarah.test` | Admin | عمارة النور + برج السلام، voting rep لشقة 201 |
| `treasurer1@imarah.test` | Treasurer | عمارة النور |
| `committee1@imarah.test` | Committee | عمارة النور |
| `resident1@imarah.test` | Resident | شقة 101 (voting rep) |
| `resident2@imarah.test` | Resident | شقة 102 (voting rep) |
| `technician1@imarah.test` | Technician | عمارة النور |

العمارات:
- **عمارة النور** (`a0000001-...`) — trial، 6 شقق، فريق كامل
- **برج السلام** (`a0000002-...`) — basic active، 4 شقق، admin فقط (لاختبار الوصول الـ cross-building للسوبر أدمن)

## توليد TypeScript types

عند توفر مشروع Supabase حقيقي:

```bash
pnpm dlx supabase gen types typescript --linked > src/types/database.ts
```

النسخة الحالية في [`src/types/database.ts`](../src/types/database.ts) **مكتوبة يدوياً** بمطابقة دقيقة للـ schema. عند ربط المشروع بـ Supabase الفعلي، يُمكن استبدالها بالتوليد الآلي.

## التحقق المحلي عبر pglite (سريع، بدون Supabase)

سكربت `scripts/sql-validate.mjs` يطبّق **كل** ملفات SQL على PGlite (Postgres-via-WASM):

```bash
node scripts/sql-validate.mjs
```

النتيجة المتوقعة: **`226 passed, 0 failed`** و `EXIT_CODE=0`.

تغطية الاختبارات:
- **Phase 1** (23): tenant consistency، vote-option integrity، CHECK، UNIQUE، audit forging، storage buckets/policies، seed counts
- **Phase 2** (5): register_building() atomicity + bootstrap removal
- **Phase 5** (8): apartment members + voting rep + role escalation prevention
- **Phase 6** (2): payments_insert + receipts_delete_own_orphan
- **Phase 7** (24+): expenses workflow + field whitelists + storage hardening
- **Phase 8** (40+): maintenance + tasks + GUC forgery + tenant locks + admin proxy scope
- **Phase 9** (4): vendors tenant lock
- **Phase 10** (24+): governance workflow + privacy + atomic standalone vote + rep-change visibility
- **Phase 11** (17+): documents tenant lock + storage row-scope + audit immutability + file_url path tenant scope
- **Phase 12** (14): financial reports — accuracy + privacy + period_month consistency + yearly counts
- **Phase 14** (28): super-admin — workflow + privacy + transitions + immutability + multi-building active fallback + role-aware fallback

> **ما يُثبته pglite**: SQL syntax + composite FKs + CHECK + UNIQUE + indexes + triggers + storage buckets/policies + seed counts + RPC behavior.
>
> **ما لا يُثبته**: RLS بـ JWT حقيقي لمستخدم محدد (يَتطلب Supabase Auth الفعلي). Storage upload/download عبر API (يَتطلب Supabase Storage Engine).
>
> Mocks المستخدمة: `auth.users`/`auth.identities` (للـ FK references)، `auth.uid()` (يَقرأ من session var)، الأدوار `authenticated`/`anon`/`service_role`، schema `storage` مع `objects`/`buckets`/`foldername()`، و stubs لـ `crypt()` + `gen_salt()` (لتشغيل seed بدون pgcrypto extension في pglite).

## اختبارات الأمان اليدوية (في Supabase الحقيقي)

### تحقق من البنية (تَشغيل بـ service_role)

```sql
-- 17 enum
select count(*) from pg_type t
  join pg_namespace n on n.oid = t.typnamespace
  where t.typtype = 'e' and n.nspname = 'public';

-- 17 جدول مع RLS مُفعَّل
select count(*) from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = true;

-- triggers (audit + workflow + tenant locks): يَجب أن يَكون > 50
select count(*) from pg_trigger
  where not tgisinternal
    and tgrelid in (select oid from pg_class where relnamespace =
      (select oid from pg_namespace where nspname = 'public'));

-- RPCs المتوقَّعة (sample): register_building, link_apartment_member,
-- update_building_subscription, platform_stats, ...
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and prosecdef = true
  order by proname;
```

### اختبارات CHECK constraints

```sql
-- يَجب أن تَفشل: payment بدون receipt_url
insert into payments (building_id, apartment_id, amount, period_month, receipt_url)
values ('a0000001-0000-0000-0000-000000000001', 'aa000101-0000-0000-0000-000000000101', 100, '2026-04-01', '');
-- ERROR: chk_payments_receipt_nonempty

-- يَجب أن تَفشل: rejected بدون rejection_reason
update payments set status = 'rejected' where id = 'd0000002-0000-0000-0000-000000000002';
-- ERROR: chk_payments_rejection_reason

-- يَجب أن تَفشل: قيمة status خارج enum
insert into payments (building_id, apartment_id, amount, period_month, receipt_url, status)
values ('a0000001-...', 'aa000101-...', 100, '2026-04-01', 'x', 'processing');
-- ERROR: invalid input value for enum payment_status

-- يَجب أن تَفشل: تصويت مكرر من نفس الشقة
insert into vote_responses (vote_id, option_id, user_id, apartment_id) values
  ('30000001-...', '40000002-...', '55555555-...', 'aa000101-...');
-- ERROR: duplicate key (uq_vote_per_apartment)

-- يَجب أن تَفشل: ممثلَين نشطَين لنفس الشقة
insert into apartment_members (... is_voting_representative=true ...);
-- ERROR: duplicate key (idx_one_voting_rep_per_apartment)
```

### اختبارات الـ RLS (تسجيل دخول كمستخدم محدد)

استخدم Supabase Studio → Authentication → اختر مستخدم → "Impersonate"، أو من الكود بـ JWT الخاص به.

| المستخدم | الاختبار | النتيجة المتوقعة |
|---|---|---|
| `resident1` | `select count(*) from payments` | 1 (فقط دفعته على شقة 101) |
| `resident1` | `select count(*) from payments where building_id = 'a0000002-...'` | 0 (لا تسرب لبرج السلام) |
| `treasurer1` | `select count(*) from payments` | 3 (كل مدفوعات عمارة النور) |
| `technician1` | `select count(*) from maintenance_requests` | فقط المسندة له |
| `super@imarah` | `select count(*) from payments` | 3 (كل المدفوعات في كل العمارات) |
| `resident1` | `select * from public.platform_stats()` | ERROR: Access denied super_admin only |
| `admin1` | `update buildings set subscription_status='active' where ...` | ERROR: Subscription fields can only be changed by super_admin |

### اختبارات Phase 14 الإضافية (subscription workflow)

```sql
-- (super_admin) trial → active مسموح
select public.update_building_subscription(
  'a0000001-...', 'pro', 'active', null, '2027-01-01'::timestamptz
);

-- (super_admin) active → trial مرفوض
select public.update_building_subscription(
  'a0000001-...', 'trial', 'trial', '2027-01-01', null
);
-- ERROR: Invalid subscription_status transition: active -> trial

-- is_building_active_subscription
select public.is_building_active_subscription('a0000001-...');
-- true إن كانت trial/active/past_due، false إن expired/cancelled

-- created_at/created_by immutable
update public.buildings set created_at = now() - interval '10 years' where id = '...';
-- ERROR: created_at is immutable on buildings
```

## تنظيف (rollback للتطوير)

```sql
-- حذف كل البيانات (تطوير فقط)
truncate audit_logs, decisions, vote_responses, vote_options, votes,
         suggestions, tasks, maintenance_requests, expenses, payments,
         apartment_members, apartments, vendors, building_memberships,
         buildings, profiles, documents cascade;

-- حذف auth users التجريبية
delete from auth.users where email like '%@imarah.test';
```

## إنشاء أول super_admin

`super_admin` هو مالك المنصة. لا يُنشَأ عبر UI — يُرقَّى يدوياً عبر SQL Editor:

1. سجِّل نفسك كمستخدم عادي عبر `/register` (سيُنشَأ profile تلقائياً عبر `handle_new_user` trigger).
2. في Supabase Studio → SQL Editor، نفِّذ:

```sql
update public.profiles
set is_super_admin = true
where id = (select id from auth.users where email = 'YOUR_EMAIL@example.com');
```

3. سجِّل خروج ودخول مرة أخرى. ستُحوَّل تلقائياً إلى `/super-admin`.

> ⚠️ في الإنتاج، يُفضَّل تقييد هذا حصراً على المالك الأول؛ لا تَجعل الترقية متاحة عبر UI.

تفاصيل أكثر للعمليات اليومية في [ADMIN_GUIDE.md](../ADMIN_GUIDE.md).
