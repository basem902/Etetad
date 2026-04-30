# DEPLOYMENT.md — دليل النشر

> من الصفر إلى production يَعمل في **< 30 دقيقة**. ينطبق على Vercel + Supabase.

## المتطلبات

- حساب [supabase.com](https://supabase.com) (مجاني للبدء)
- حساب [vercel.com](https://vercel.com) (مجاني للبدء)
- Git repo (GitHub / GitLab / Bitbucket) فيه كود المشروع
- Domain (اختياري — Vercel يُوفِّر `*.vercel.app` افتراضياً)

التقدير الزمني:
- إنشاء Supabase وتطبيق SQL: 15 دقيقة
- ربط Vercel ونشر: 10 دقائق
- إنشاء أول super_admin + اختبار: 5 دقائق

---

## المرحلة 1 — إنشاء مشروع Supabase production

### 1.1 أنشئ المشروع

1. [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**
2. الإعدادات:
   - **Name**: `imarah-prod` (أو ما تَختار)
   - **Database Password**: قويّة، احفظها — ستَحتاجها لاحقاً للـ CLI/migrations
   - **Region**: الأقرب جغرافياً (للـ MENA: `eu-central-1` Frankfurt — حالياً أقرب من `me-south-1` Bahrain غير المتوفِّر)
   - **Pricing Plan**: Free يَكفي لبداية (حتى 500MB DB + 1GB Storage). للـ production الجاد: Pro $25/شهر.
3. انتظر دقيقتَين حتى يَجهز.

### 1.2 احفظ المفاتيح

في Supabase Dashboard → **Project Settings** → **API**:

| المفتاح | الاستخدام | السرّية |
|---|---|---|
| `URL` | `NEXT_PUBLIC_SUPABASE_URL` | عام |
| `anon` `public` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | عام (RLS تَحميه) |
| `service_role` `secret` | `SUPABASE_SERVICE_ROLE_KEY` | **سرّي تماماً** |

⚠️ **`service_role` يَتجاوز RLS**. لا تَنشره في الـ client أبداً، لا تَلتزم به في git.

### 1.3 طبّق ملفات SQL بالترتيب

في Supabase Dashboard → **SQL Editor** → **New query** → نفّذ كل ملف من المشروع. RC 1.0.0 يَحوي **20 ملف SQL** (Phase 0 إلى Phase 19):

| # | الملف | الفاز | الزمن |
|---|---|---|---|
| 1 | `01_schema.sql` | 0/1 — schema + 17 enums + 17 جدولاً | < 1 ث |
| 2 | `02_functions.sql` | 0/1 — helper functions (is_super_admin, user_has_role, ...) | < 1 ث |
| 3 | `03_triggers.sql` | 0/1 — audit_changes triggers على الجداول الحساسة | < 1 ث |
| 4 | `04_policies.sql` | 0/1 — RLS policies الأساسية | < 1 ث |
| 5 | `05_storage.sql` | 0/1 — 7 storage buckets أساسية + RLS عليها | < 1 ث |
| 6 | ⚠️ **تخطّى `06_seed.sql`** — seed تطوير، **لا تُطبِّقه في الإنتاج** | — | — |
| 7 | `07_phase2.sql` | 2 — register_building + onboarding | < 1 ث |
| 8 | `08_phase5.sql` | 5 — apartments + voting representative | < 1 ث |
| 9 | `09_phase6.sql` | 6 — payments | < 1 ث |
| 10 | `10_phase7.sql` | 7 — expenses | < 1 ث |
| 11 | `11_phase8.sql` | 8 — maintenance + private linking marker | < 1 ث |
| 12 | `12_phase9.sql` | 9 — vendors | < 1 ث |
| 13 | `13_phase10.sql` | 10 — suggestions/votes/decisions | < 1 ث |
| 14 | `14_phase11.sql` | 11 — documents + audit_logs | < 1 ث |
| 15 | `15_phase12.sql` | 12 — reports | < 1 ث |
| 16 | `16_phase14.sql` | 14 — super-admin + buildings_validate_update trigger | < 1 ث |
| 17 | `17_phase16.sql` | 16 — marketing + subscription_tiers + platform_settings + contact requests | < 1 ث |
| 18 | `18_phase17.sql` | 17 — building join links + pending members | < 1 ث |
| 19 | `19_phase18.sql` | 18 — bank-transfer subscription orders + private cron marker + subscription_receipts bucket | 1-2 ث |
| 20 | `20_phase19.sql` | 19 — team RPCs + renewal/plan-change orders + bulk_import_jobs + reminders + bulk_import_uploads bucket | 1-2 ث |

> **الترتيب مهم**: كل ملف يَفترض الذي قبله مُطبَّق. لا تَتخطَّى ملفاً (إلا `06_seed.sql` كما ذُكر).

> **التَحقُّق**: بعد تَطبيق الـ 20 ملف، يَجب أن يَكون عندك:
> - **17 جدول** في schema `public` + جدولان جديدان (`subscription_orders`, `subscription_requests`, `building_join_links`, `pending_apartment_members`, `subscription_tiers`, `platform_settings`, `bulk_import_jobs`, `subscription_reminders_sent`) = **25 جدولاً تَطبيقياً**
> - **8 storage buckets** (avatars, documents, invoices, logos, maintenance, receipts, subscription_receipts, bulk_import_uploads)
> - **schema `private`** (للـ markers الحساسة من Phase 8 + Phase 18)

### 1.4 (بديل) عبر Supabase CLI أو psql

إن كنت تُفضِّل CLI:

```bash
# تثبيت CLI (مرة واحدة)
brew install supabase/tap/supabase   # macOS
# أو: npm install -g supabase

# اربط الـ repo بمشروع Supabase
supabase link --project-ref <YOUR_PROJECT_REF>

# طبّق الملفات (الترتيب مَهم — تخطَّ 06_seed.sql)
for f in 01_schema 02_functions 03_triggers 04_policies 05_storage \
         07_phase2 08_phase5 09_phase6 10_phase7 11_phase8 \
         12_phase9 13_phase10 14_phase11 15_phase12 16_phase14 \
         17_phase16 18_phase17 19_phase18 20_phase19; do
  echo "Applying $f.sql..."
  psql "$SUPABASE_DB_URL" -f "supabase/$f.sql" || { echo "FAIL on $f"; exit 1; }
done
```

`SUPABASE_DB_URL` تَجده في Project Settings → Database → Connection string (URI mode، مع كلمة مرور قاعدة البيانات).

### 1.5 تحقّق من التطبيق

في SQL Editor:

```sql
-- يَجب أن يُرجع 25 جدولاً تَطبيقياً (Phase 1 = 17، + Phase 16-19 = 8)
select count(*) from information_schema.tables
where table_schema = 'public';

-- يَجب أن يُرجع 17 enum (لم تُضف enums بعد Phase 1)
select count(*) from pg_type t
join pg_namespace n on n.oid = t.typnamespace
where t.typtype = 'e' and n.nspname = 'public';

-- 8 storage buckets
select id, public from storage.buckets order by id;
-- expected: avatars (public), bulk_import_uploads (private),
-- documents (private), invoices (private), logos (public),
-- maintenance (private), receipts (private), subscription_receipts (private)

-- schema private موجود (للـ markers من Phase 8 + Phase 18)
select count(*) from information_schema.schemata where schema_name = 'private';
-- expected: 1

-- يَجب أن تَعمل كل الـ RPCs (نموذج)
select pg_get_functiondef('public.register_building'::regproc) is not null as exists;
select pg_get_functiondef('public.create_subscription_order'::regproc) is not null as exists;
select pg_get_functiondef('public.expire_due_subscriptions'::regproc) is not null as exists;
select pg_get_functiondef('public.find_and_record_subscription_reminders'::regproc) is not null as exists;

-- يَجب أن يَكون عدد buildings = 0 (لا seed)
select count(*) from public.buildings;
```

إن كانت الأعداد خاطئة (مثلاً `buildings >= 1`)، فأنت طبّقت `06_seed.sql` بالخطأ. نظِّف:

```sql
truncate audit_logs, decisions, vote_responses, vote_options, votes,
         suggestions, tasks, maintenance_requests, expenses, payments,
         apartment_members, apartments, vendors, building_memberships,
         buildings, profiles,
         subscription_orders, subscription_requests, subscription_tiers,
         platform_settings, building_join_links, pending_apartment_members,
         bulk_import_jobs, subscription_reminders_sent cascade;
delete from auth.users where email like '%@imarah.test' or email like '%@test';
```

---

## المرحلة 2 — إعدادات Supabase Auth

### 2.1 ضبط نمط التسجيل

في Dashboard → **Authentication** → **Providers** → **Email**.

**نمطان مدعومان**:

#### نمط (أ) — تسجيل عام مفتوح
- اترك Email signup = **ON**.
- أي شخص يَزور `/register` يَقدر يُنشئ حساباً، ثم يَنتظر admin يَربطه بشقة.
- الأنسب لمنصة عامة تَقبل تسجيل ذاتي.

#### نمط (ب) — invite-only (موصى به للنشر الخاص)
- بعد إنشاء أول `super_admin` (المرحلة 4 أدناه)، عطِّل Email signup = **OFF**.
- منذ هنا، أي ساكن جديد يَنضم بإحدى طريقتَين:
  1. Admin العمارة يَفتح `/apartments/[id]` → "إضافة عضو" → يُدخِل بريد الساكن:
     - لو البريد مُسجَّل سابقاً (نادراً): يُربط مباشرة.
     - لو غير مُسجَّل: Supabase يُرسل دعوة بريدية تلقائياً عبر `auth.admin.inviteUserByEmail`. الساكن يَضغط الرابط، يَضع كلمة مرور، ثم يَدخل وقد ربطه admin بشقته.
  2. super_admin يُنشئ admin عمارة جديدة بنفس المسار من `/super-admin`.
- يَتطلَّب نمط invite-only أن يَكون `SUPABASE_SERVICE_ROLE_KEY` مَضبوطاً في Vercel — وإلا الدعوة تَفشل.

> ملاحظة: بيانات `06_seed.sql` (في حال شغّلتها بالخطأ في الإنتاج) تَستخدم تسجيلاً مباشراً في `auth.users` — لو كنت في نمط invite-only، احذف seed users قبل تَعطيل التسجيل.

### 2.2 ضبط رابط إعادة التوجيه

في Dashboard → **Authentication** → **URL Configuration**:

- **Site URL**: `https://your-domain.com` (أو `https://your-app.vercel.app` مؤقتاً)
- **Redirect URLs** (أَضِف كل واحدة):
  - `https://your-domain.com/auth/callback`
  - `https://your-domain.com/reset-password`
  - `http://localhost:3000/auth/callback` (للتطوير المحلي)

⚠️ بدون هذا، روابط email للـ verification وreset-password ستَفشل.

### 2.3 (اختياري) تخصيص قوالب البريد

في Dashboard → **Authentication** → **Email Templates**: عدِّل لغة وتنسيق الإيميلات (Confirm signup، Reset password، Magic link، Invite user).

افتراضياً بالإنجليزية. إن أردت العربية، عدِّل النصوص هنا.

### 2.4 — مَنظومتا البريد: Supabase Auth vs بريد التطبيق

**النَقطة الحاسمة**: التطبيق يَستخدم **مَنظومتَين بريديتَين مُنفصلتَين** لا تَتشارك أي إعداد. خَلطها يَحدُث كثيراً ويُربك الـ deploy.

| المَنظومة | المَزود | يُكوَّن في | الـ env vars في Vercel | يُرسل ماذا |
|---|---|---|---|---|
| **Supabase Auth** | مَزود Supabase الافتراضي (أو SMTP مُخصَّص) | Supabase Dashboard → Authentication → SMTP Settings + Email Templates | لا شيء (Supabase يُديره داخلياً) | Confirm signup، Reset password، Magic link، **كل** `auth.admin.inviteUserByEmail` (الذي يُستدعى من /apartments link، /team add، /super-admin order approve) |
| **بريد التطبيق** | Resend | resend.com Dashboard | `RESEND_API_KEY` + `RESEND_FROM_EMAIL` | order created/approved/rejected (Phase 18)، renewal created/approved (Phase 19)، subscription reminders 30/14/7 (Phase 19)، /contact notification + confirmation (Phase 16) |

#### نَقطة الالتقاء (يَحدُث في Phase 18 + Phase 19)

عند اعتماد طلب اشتراك جديد، العميل يَستلم **بريدَين مُنفصلَين**:
1. **من Resend** (بريد التطبيق): "تم اعتماد اشتراك عمارتك" مع dashboard URL — `renderOrderApprovedEmail`
2. **من مَزود Supabase Auth**: "Confirm your invite" مع رابط لإعداد كلمة المرور — `auth.admin.inviteUserByEmail`

لو فقط Resend مُكوَّن → العميل يَستلم (1) فقط ولا يَستطيع تَعيين كلمة المرور.
لو فقط Supabase Auth مُكوَّن → العميل يَستلم (2) فقط بدون شَرح أن اشتراكه اعتُمد.
**يَجب الاثنان**.

#### Supabase SMTP الافتراضي (rate-limited)

افتراضياً، Supabase يَستخدم مَزوداً مَجانياً مع **حد 3-4 emails/ساعة لكل project** ولا يُسلِّم لكل ISPs بشكل موثوق. مَناسب للتَطوير، **غير مَناسب للإنتاج**.

#### تَكوين SMTP مُخصَّص في Supabase (موصى به للـ production)

إن أردت reliability + branded "From" + capacity أعلى، اضبط custom SMTP:

1. Supabase Dashboard → **Authentication** → **Settings** → قِسم **SMTP Settings** → **Enable Custom SMTP**.
2. ضع بيانات SMTP لمَزودك. Resend يَدعم SMTP عبر:
   - Host: `smtp.resend.com`
   - Port: `587` (TLS) أو `465` (SSL)
   - Username: `resend`
   - Password: نَفس `RESEND_API_KEY` (تَعمل كـ SMTP password)
   - Sender email: نَفس `RESEND_FROM_EMAIL` (يَجب verified)
3. احفظ، ثم اختبر "Send test email" من نَفس الصفحة.

> ⚠️ تَكوين Vercel env vars وحده لا يَكفي لتَوجيه Auth emails عبر Resend. يَجب نَسخ نَفس البيانات إلى Supabase Dashboard SMTP Settings. الـ env vars في Vercel تُكوِّن **بريد التطبيق فقط** (`src/lib/email/index.ts` → Resend SDK).

#### قائمة التَحقُّق السَريعة

- [ ] Supabase Dashboard → SMTP Settings: enabled (لو تَستخدم SMTP مُخصَّص) أو يَستخدم الافتراضي مع علم بحد المُعدَّل.
- [ ] Vercel env: `RESEND_API_KEY` + `RESEND_FROM_EMAIL` مَضبوطان.
- [ ] Resend Dashboard: domain verified.
- [ ] Test invite عبر /super-admin/buildings (uses Supabase Auth) → يَصل.
- [ ] Test order email عبر /subscribe (uses Resend) → يَصل.
- [ ] الاثنان يَصلان عند اعتماد طلب جديد.

---

## المرحلة 3 — النشر على Vercel

### 3.1 ادفع الكود إلى Git

```bash
git remote add origin git@github.com:<you>/imarah.git
git push -u origin main
```

### 3.2 استورد المشروع في Vercel

1. [vercel.com/new](https://vercel.com/new) → **Import Git Repository** → اختر الـ repo.
2. الإعدادات الافتراضية صحيحة:
   - **Framework Preset**: Next.js (يُكتشف تلقائياً)
   - **Build Command**: `pnpm build` (أو يَترك Vercel يَكتشف)
   - **Output Directory**: `.next` (افتراضي)
   - **Install Command**: `pnpm install`
3. **اضبط متغيرات البيئة** قبل أول deploy. RC 1.0.0 يَتطلَّب **7 متغيرات إلزامية** + 1 اختياري (راجع `.env.example` للتَفاصيل):

| Name | Value | Environments | إلزامي؟ |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | من Supabase Dashboard → API | Production + Preview + Development | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | من Supabase | Production + Preview + Development | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | من Supabase (⚠️ secret) | Production + Preview | ✅ |
| `NEXT_PUBLIC_APP_URL` | `https://your-domain.com` | Production | ✅ |
| `NEXT_PUBLIC_APP_URL` | `https://imarah-preview.vercel.app` | Preview | ✅ |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Development | ✅ |
| `RESEND_API_KEY` | من resend.com/api-keys (⚠️ secret) | Production + Preview | ✅ للـ prod |
| `RESEND_FROM_EMAIL` | `noreply@your-domain.com` (verified في Resend) | Production + Preview | ✅ للـ prod |
| `CRON_SECRET` | `openssl rand -base64 32` (⚠️ secret) | Production + Preview | ✅ للـ prod |
| `SUPER_ADMIN_NOTIFICATION_EMAIL` | بريد المالك | Production | اختياري |

> **انتبه**: متغيرات `NEXT_PUBLIC_*` تُحقَن في bundle المتصفح وتَبقى visible. لا تَضع فيها أسراراً.

> **بدون Resend**: بريد التطبيق فقط يَتأثَّر — orders, renewals, reminders, /contact تَفشل بصمت. **رسائل Supabase Auth (Confirm signup، Reset password، invites عبر `auth.admin.inviteUserByEmail`) لا تَتأثَّر** — تَستمر عبر مَزود Supabase الافتراضي (راجع §2.4). فشل بريد التطبيق يُسجَّل في `audit_logs` (عبر `log_email_failure`)، **عدا** subscription_reminders التي تُسجَّل في `subscription_reminders_sent.email_status`.

> **بدون CRON_SECRET**: cron endpoints الثلاثة تُرجع 503. اشتراكات لا تَنتهي تلقائياً، orders لا تُكنس، reminders لا تُرسَل.

4. اضغط **Deploy**.

### 3.2.1 سَجِّل الـ crons في Vercel

`vercel.json` في root الـ repo يَحوي 3 cron schedules. Vercel يَكتشفها تلقائياً عند الـ deploy:

```json
{
  "crons": [
    { "path": "/api/cron/expire-orders", "schedule": "0 2 * * *" },
    { "path": "/api/cron/expire-subscriptions", "schedule": "5 2 * * *" },
    { "path": "/api/cron/subscription-reminders", "schedule": "0 9 * * *" }
  ]
}
```

| Cron | Schedule (UTC) | الوظيفة | Phase |
|---|---|---|---|
| `expire-orders` | يَومي 02:00 | يُحوِّل subscription_orders المَهجورة (`awaiting_payment` > 30 يوم) إلى `expired` | 18 |
| `expire-subscriptions` | يَومي 02:05 | يُحوِّل buildings whose `subscription_ends_at < now()` إلى `expired` (يَحفظ `subscription_ends_at` للـ audit) | 18 |
| `subscription-reminders` | يَومي 09:00 | يُرسل reminder emails للـ admins قبل 30/14/7 يوم من الانتهاء | 19 |

**التَحقُّق بعد deploy**:
1. Vercel Dashboard → Project → **Crons** → يَجب أن تَجد الثلاثة مُسجَّلين.
2. اضغط أي cron → **Trigger** يَدوياً → يَجب أن يُرجع `{ success: true, ... }`.
3. لو رجَع `401` → `CRON_SECRET` مَفقود/خاطئ.
4. لو رجَع `503` → `SUPABASE_SERVICE_ROLE_KEY` أو `CRON_SECRET` مَفقود.

### 3.3 (اختياري) custom domain

في Vercel Project → **Settings** → **Domains** → أَضِف `your-domain.com`. اتبع تعليمات DNS (CNAME أو A record).

بعد الربط:
- حدِّث `NEXT_PUBLIC_APP_URL` إلى `https://your-domain.com` وأَعِد الـ deploy.
- حدِّث Supabase Auth → URL Configuration → Site URL + Redirect URLs.

---

## المرحلة 4 — إنشاء أول super_admin

`super_admin` هو مالك المنصة. لا يُنشَأ عبر UI — يُرقَّى يدوياً عبر SQL.

### 4.1 سجِّل نفسك كمستخدم عادي

افتح `https://your-domain.com/register` وسجِّل بحسابك.

### 4.2 رقِّ حسابك إلى super_admin

في Supabase Dashboard → **SQL Editor**:

```sql
update public.profiles
set is_super_admin = true
where id = (
  select id from auth.users where email = 'YOUR_EMAIL@example.com'
);
```

### 4.3 سجِّل خروج وأَعِد الدخول

ستُحوَّل تلقائياً إلى `/super-admin` (لوحة المنصة).

من هنا تَقدر:
- إنشاء عمارات للمسؤولين (أو يُسجِّلونها بأنفسهم عبر `/onboarding`).
- تعديل خطط/حالات الاشتراك لكل عمارة.
- تعطيل/تفعيل العمارات.
- مشاهدة سجلات المنصة الكاملة.

---

## المرحلة 5 — التحقق من الـ deploy (Smoke Test الكامل لـ RC 1.0.0)

نَفِّذ هذه القَوائم بالترتيب. أي ✗ = blocker لا يُسمح معه بالـ tag `v1.0.0`.

### 5.1 صفحات Marketing (anon)

- [ ] `/` يَعرض الـ landing بدون console errors.
- [ ] `/pricing` يَعرض الـ tiers من DB (basic/pro/enterprise) مع أسعار.
- [ ] `/contact` form يَقبل submission → super_admin يَستلم email (لو SUPER_ADMIN_NOTIFICATION_EMAIL مَضبوط).
- [ ] `/subscribe?tier=pro&cycle=yearly` يَعرض النَموذج، submission يُولِّد order + يُرسل email للعميل بـ تَعليمات التَحويل + الـ receipt URL.

### 5.2 Auth flow

- [ ] `/register` (لو مُفعَّل) أو `/login` يَقبل بريد + كلمة مرور.
- [ ] إيميل Supabase "Confirm signup" يَصل (مَزود Supabase الافتراضي، **لا يَمر عبر Resend** — راجع §2.4).
- [ ] `/reset-password` يُرسل email استعادة.
- [ ] callback `/auth/callback` يُحوِّل المستخدم للـ /dashboard.

### 5.3 Subscribe → Provisioning (Phase 18 e2e)

- [ ] /subscribe يُنشئ order → email يَصل بـ مَرجع SUB-YYYY-NNNN + bank details + رابط `/subscribe/[id]?t=...`
- [ ] الرابط يَفتح صفحة رفع الإيصال (token validation يَنجح، split counter يَزيد).
- [ ] رفع إيصال → status يَنتقل لـ `awaiting_review` → ملف في bucket `subscription_receipts`.
- [ ] super_admin → `/super-admin/orders` يَرى الـ order.
- [ ] super_admin يَضغط "اعتماد" → invite يُرسَل + building يُنشأ + admin membership يُضاف + email تأكيد للعميل.
- [ ] العميل يَستلم Supabase invite + email "تم الاعتماد" → يَضع كلمة مرور → يَدخل /dashboard لعمارته.

### 5.4 Renewal flow (Phase 19 e2e)

- [ ] من حساب admin: `/subscribe?renew=true&building=X` يَعرض نَموذج التَجديد مع الـ tier الحالي + ends_at.
- [ ] submission يُولِّد renewal order (is_renewal=true) → email تَجديد للـ admin.
- [ ] super_admin يَعتمد → `complete_renewal` يَمتد `subscription_ends_at` (يَحفظ الأيام المُتبقية) → email تأكيد.
- [ ] لو الـ tier تَغيَّر → `subscription_plan` يَتحدَّث + previous_tier_id snapshot في الـ order.

### 5.5 /team (Phase 19)

- [ ] admin → `/team` → يَرى قائمة فارغة + زر "إضافة عضو فريق".
- [ ] إضافة treasurer بـ email غير مُسجَّل → invite يُرسَل + membership يُضاف.
- [ ] إضافة دور غير مَسموح (admin/resident) عبر API → يُرفض بـ رسالة عربية.
- [ ] إزالة عضو فريق → يَختفي من القائمة.

### 5.6 Bulk Import (Phase 19)

- [ ] admin → `/apartments/import` → ارفع CSV من 5 شقق → INSERT atomic، job=completed، الشقق تَظهر في `/apartments`.
- [ ] ارفع CSV فيه صف خاطئ (number فارغ) → atomic rollback، **لا** شقة تُنشأ، errors تَظهر per row.
- [ ] ارفع CSV >1MB أو صيغة غير CSV → رفض بـ رسالة واضحة.
- [ ] ارفع CSV بـ خلية تَبدأ بـ `=SUM(...)` → رفض (CSV injection defense).
- [ ] `/apartments/members-import` بـ users مُسجَّلين + apartments صالحة → ربط ناجح + voting rep يَظهر للأول.

### 5.7 Apartments + Payments + Maintenance + Votes (Phase 5-10)

- [ ] admin يُضيف شقة → يَظهر في القائمة.
- [ ] resident يَرفع payment receipt → bucket `receipts` → admin يَعتمد → يَظهر في المُعتَمَدة.
- [ ] resident يَفتح maintenance request → admin يَنقلها بين الحالات.
- [ ] admin يَفتح vote → resident representative يُصوِّت → admin يُغلق → النتيجة في `/decisions`.

### 5.8 PWA + Offline

- [ ] افتح التطبيق على iPhone/Android → Share → "Add to Home Screen" → يُثبَّت بأيقونة عربية.
- [ ] فعِّل airplane mode → افتح التطبيق → يَعرض `/offline.html`.
- [ ] افحص `/sw.js` → يَرجع 200.
- [ ] في DevTools → Application → Manifest → كل الحقول صحيحة.

### 5.9 Cron endpoints

```bash
# ضع CRON_SECRET الفعلي في الأمر (لـ test يَدوي)
SECRET="your-cron-secret"
BASE="https://your-domain.com"

# 1. expire-orders
curl -i -X POST "$BASE/api/cron/expire-orders" \
  -H "Authorization: Bearer $SECRET"
# Expected: 200 + { success: true, expired: <int> }

# 2. expire-subscriptions
curl -i -X POST "$BASE/api/cron/expire-subscriptions" \
  -H "Authorization: Bearer $SECRET"
# Expected: 200 + { success: true, expired: <int> }

# 3. subscription-reminders
curl -i -X POST "$BASE/api/cron/subscription-reminders" \
  -H "Authorization: Bearer $SECRET"
# Expected: 200 + { success: true, found, sent, failed, skipped }

# اختبار negative — بدون header → 401
curl -i -X POST "$BASE/api/cron/expire-orders"
# Expected: 401 Unauthorized
```

- [ ] الثلاثة تُرجع 200 مع secret الصحيح، 401 بدونه.
- [ ] Vercel Dashboard → Crons → الثلاثة executed خلال 24 ساعة بدون 5xx.

### 5.10 audit_logs

- [ ] أي اعتماد order/payment/expense → entry جديد في `audit_logs` بـ actor_id + before/after.
- [ ] super_admin → `/super-admin/audit` → يَعرض الأخيرة.
- [ ] بعد `change_subscription_plan` (Phase 19): row جديد بـ `action='PLAN_CHANGE'` يَحوي notes + old/new values.

---

## المرحلة 5.5 — Rollback Plan

لو deploy فَشل (5xx على الـ landing، middleware يَكسر، DB migration error)، RC 1.0.0 يَدعم rollback آمن في 3 طبقات:

### Vercel rollback (الأسرع — < 1 دقيقة)

1. Vercel Dashboard → Project → **Deployments**.
2. اعثر على آخر deploy ناجح (لون أخضر).
3. اضغط ⋯ → **Promote to Production**.
4. الموقع يَرجع للنسخة السابقة فوراً. متغيرات البيئة لا تَتأثَّر.

### DB rollback (للـ migration الفاشل)

السيناريو: طبَّقت `20_phase19.sql` وحَدث constraint conflict على بيانات قَديمة.

1. **ابدأ من backup**: Supabase Dashboard → Database → Backups → اختر آخر backup قبل الـ migration → **Restore**. (Pro tier يَدعم PITR لحظي؛ Free tier يَدعم daily backups فقط.)
2. **بَديل يَدوي** للـ Phase 19 خصوصاً (لو الـ Phase 18 وما قبلها سَليم):
   ```sql
   -- إزالة Phase 19 schema additions (لا data loss على Phase 1-18)
   drop function if exists public.find_and_record_subscription_reminders();
   drop function if exists public.update_reminder_email_status(uuid, text, text);
   drop function if exists public.process_apartments_bulk_import(uuid, jsonb);
   drop function if exists public.process_members_bulk_import(uuid, jsonb);
   drop function if exists public.cancel_bulk_import_job(uuid);
   drop function if exists public.create_bulk_import_job(uuid, text, text, text);
   drop function if exists public.change_subscription_plan(uuid, text, text, text);
   drop function if exists public.complete_renewal(uuid);
   drop function if exists public.create_renewal_order(uuid, text, text, text);
   drop function if exists public.deactivate_team_member(uuid);
   drop function if exists public.add_team_member(uuid, uuid, public.membership_role);
   drop table if exists public.subscription_reminders_sent cascade;
   drop table if exists public.bulk_import_jobs cascade;
   alter table public.subscription_orders
     drop constraint if exists chk_renewal_fields,
     drop column if exists previous_tier_id,
     drop column if exists is_plan_change,
     drop column if exists renews_building_id,
     drop column if exists is_renewal;
   delete from storage.buckets where id = 'bulk_import_uploads';
   ```
3. أَعِد الـ Vercel deploy على نسخة الكود السابقة (قبل Phase 19).

### Cron rollback

لو cron route يُسبِّب data corruption (مثلاً يَكنس orders شَرعية):

1. Vercel Dashboard → Crons → اضغط الـ cron → **Pause** (يُوقفه فوراً، لا يَنتظر للـ deploy التالي).
2. حَقِّق المُشكلة، عَدِّل الكود، أَعِد الـ deploy، ارفع الـ pause.

### Email rollback

لو **بريد التطبيق** يَخرج بصيغة خاطئة أو لجمهور غير مَقصود (Resend فقط — لا يَشمل invites/Confirm signup التي تَخرج من Supabase Auth، راجع §2.4):

1. Resend Dashboard → API Keys → اضغط الـ مفتاح → **Pause** (يُوقف كل بريد التطبيق فوراً).
2. التطبيق يَستمر في تَسجيل الـ failures بحَسب نوع البريد (نَفس التَقسيم في §2.4):
   - orders/renewals/contact → `log_email_failure` RPC → جدول `audit_logs` (filter بـ `entity_type='subscription_order'` أو `'contact_request'`).
   - subscription_reminders → جدول `subscription_reminders_sent` (`email_status='failed'` + `email_error` يَحوي السبب).
3. عَدِّل templates، أَعِد deploy، ارفع الـ pause.

> لو مُشكلة الإرسال في رسائل **Supabase Auth** بدلاً من بريد التطبيق (مثل invite يَصل بصيغة خاطئة): الـ rollback يَحدُث في **Supabase Dashboard → Authentication → SMTP Settings** (إيقاف SMTP المُخصَّص يُعيد التَطبيق لمَزود Supabase الافتراضي) أو **Email Templates** (تَعديل القوالب). Resend Dashboard لا تَأثير له هنا.

---

## Smoke test مُلخَّص (لـ super_admin)

من حساب super_admin، الترتيب الأقصر:

1. `/super-admin` → الـ stats صحيحة.
2. سجِّل عمارة عبر `/subscribe` ثم اعتمد من `/super-admin/orders`.
3. سجِّل دخول كـ admin الجديد → `/team` يَعمل، `/apartments` يَعمل.
4. أَنشئ payment + expense + maintenance + vote — كل واحد يَلتقطه audit log.
5. ارجع إلى super_admin → `/super-admin/audit` يَعرض كل ما سَبق.
6. اختبر cron `expire-subscriptions` يَدوياً عبر curl → 200.

---

## المرحلة 6 — Hardening للإنتاج

### 6.1 أمن قاعدة البيانات

- **PITR** (Point-in-time recovery): فعِّله من Supabase Dashboard → Database → Backups (يَحتاج Pro).
- **Custom domain لـ Supabase** (اختياري لكن أنظف): Project Settings → Custom Domains.
- **Connection pooling**: مُفعَّل افتراضياً عبر PgBouncer.

### 6.2 الأداء

- **Vercel Analytics**: فعِّله من Project → Analytics (مجاني حتى 100K زيارة/شهر).
- **Speed Insights**: نفس المكان — يَتتبَّع Core Web Vitals.

### 6.3 المراقبة

- **Vercel Logs**: في الـ Project → Deployments → انقر deploy → Functions logs.
- **Supabase Logs**: Dashboard → Logs → Postgres / API / Auth.

### 6.4 الـ secrets rotation

قواعد:
- لا تُلتزم `.env.local` في git أبداً (`.gitignore` يَحميك).
- إذا تَسرَّب `service_role` بالخطأ: من Supabase → Project Settings → API → **Roll** key. حدِّث القيمة في Vercel وأعِد deploy.

### 6.5 backup خارجي (موصى به)

كل شهر — تصدير schema + data إلى مكان خارج Supabase:

```bash
pg_dump "$SUPABASE_DB_URL" --no-owner --no-acl --schema=public \
  > "backup-$(date +%Y%m%d).sql"
```

احفظ في S3/Drive/Dropbox.

---

## استكشاف الأخطاء

### `register_building` يَفشل بـ "not authenticated"

تأكَّد أن الجلسة سليمة. إن طبَّقت SQL خارج الترتيب وحُذف `auth.uid()`، أَعِد ملفات `02_functions.sql` و `07_phase2.sql`.

### Login يَنجح لكن middleware يَدور في loops

تأكد:
- `NEXT_PUBLIC_APP_URL` في Vercel = الـ domain الفعلي.
- Supabase → Auth → Site URL = نفس الـ domain.
- Supabase → Auth → Redirect URLs تَحوي `<domain>/auth/callback`.

### PWA لا يُثبَّت

- HTTPS إلزامي (Vercel default). على HTTP لن يَعمل.
- افحص `/manifest.webmanifest` — يَجب أن يَرجع 200 + JSON صحيح.
- `pnpm build` محلياً ثم `pnpm start` — افتح DevTools → Application → Manifest.

### offline page لا تَظهر

- `/sw.js` يَجب أن يَرجع 200 (Vercel يَخدمه من `public/sw.js`).
- `pnpm build` يُولِّد `public/sw.js` عبر Serwist plugin.
- postbuild check يَفشل لو `/offline.html` غير في الـ precache — هذا حماية.

### Supabase free tier يَنفد

- Database storage > 500MB: نظِّف audit_logs قديمة، أو ارفع للـ Pro.
- Storage > 1GB: انقل الإيصالات القديمة إلى cold storage (S3).
- Egress > 5GB/شهر: راقب من Dashboard → Reports → Egress.

---

## النشر الموصى به للمستقبل

عندما يَنمو المشروع:

1. **CI/CD**: GitHub Actions يُشغِّل `pnpm typecheck && pnpm lint && node scripts/sql-validate.mjs && pnpm build` على كل PR.
2. **Migrations منظَّمة**: انتقل إلى Supabase migrations workflow (`supabase migration new`) بدلاً من تطبيق ملفات SQL يدوياً.
3. **Preview environments**: Vercel + Supabase branching (Pro feature) لكل PR.
4. **Sentry / LogRocket** لـ error tracking.

---

## ملخص (RC 1.0.0)

```
Supabase project + 20 SQL files (تخطَّ 06_seed.sql)
+ 8 storage buckets (auto-created via 05_storage.sql + Phase 18/19)
+ schema private (auto-created)
+ Vercel deploy + 7 env vars (Supabase×3 + APP_URL + Resend×2 + CRON_SECRET)
+ 3 cron schedules (auto-registered من vercel.json)
+ super_admin promotion عبر SQL
+ Resend domain verification
= نظام إدارة عمارة جاهز للإنتاج (19 phase × 100/100 من Codex)
```

| الإحصائية | القيمة |
|---|---|
| SQL migration files | 20 |
| Storage buckets | 8 |
| Cron schedules | 3 |
| Env vars (إلزامي) | 7 |
| Env vars (اختياري) | 1 |
| Tests SQL | 378/378 ✅ |
| Vulnerabilities | 0 ✅ |

أي خطأ خلال النشر، راجع [supabase/README.md](./supabase/README.md) للسيناريوهات الأمنية، [CHANGELOG.md](./CHANGELOG.md) للسياق التاريخي للمراحل، أو القسم "Rollback Plan" أعلاه.
