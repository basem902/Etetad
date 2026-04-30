# نظام إدارة العمارة (imarah)

> منصة شفافة متعدّدة المستأجرين لإدارة العمارات السكنية. SaaS عربية بالكامل (RTL).

[![Tests](https://img.shields.io/badge/tests-226%2F226-success)]() [![Phase](https://img.shields.io/badge/phase-15%20final-blue)]() [![Stack](https://img.shields.io/badge/Next.js-15-black)]() [![Lang](https://img.shields.io/badge/Arabic-RTL-green)]()

## ما هذا المشروع؟

`imarah` نظام لإدارة العمارات يُتيح للمسؤولين والسكان التعامل بشفافية مع:
- **المالية**: مدفوعات شهرية، اعتماد إيصالات، مصروفات بإيصالات، تقارير شهرية/سنوية.
- **الصيانة**: طلبات بـ workflow كامل (8 حالات)، تعيين فنيين، صور قبل/بعد.
- **الحوكمة**: اقتراحات السكان، تصويتات بنظام "ممثل الشقة"، قرارات موثَّقة.
- **التوريد**: المزودون مع تقييمات وملاحظات.
- **التدقيق**: كل تغيير حساس مُسجَّل تلقائياً عبر triggers.
- **PWA**: تَعمل كتطبيق مُثبَّت + offline fallback.

النظام **متعدّد المستأجرين** — العمارة الواحدة tenant معزول بـ Row Level Security (RLS) من قاعدة البيانات.

---

## التشغيل المحلي (< 15 دقيقة)

### المتطلبات
- **Node.js** ≥ 20
- **pnpm** ≥ 9 — للتثبيت: `npm install -g pnpm`
- **مشروع Supabase** (مجاني — supabase.com → New project)

### الخطوات

#### 1. استنسخ المشروع وثبّت dependencies

```bash
git clone <repo-url> imarah
cd imarah
pnpm install
```

#### 2. أنشئ مشروع Supabase

1. اذهب إلى [supabase.com](https://supabase.com) → **New project** (المجاني كافٍ للتجربة).
2. اختر اسماً وكلمة مرور قاعدة البيانات.
3. انتظر دقيقتَين حتى يَجهز المشروع.

#### 3. طبّق ملفات SQL

في Supabase Dashboard → **SQL Editor** → نفّذ الملفات بالترتيب التالي (لكل ملف: انسخ → الصق → Run):

```
supabase/01_schema.sql       # الجداول + ENUMs + indexes
supabase/02_functions.sql    # RLS helpers
supabase/03_triggers.sql     # updated_at + audit + handle_new_user
supabase/04_policies.sql     # RLS policies
supabase/05_storage.sql      # 6 buckets + storage policies
supabase/06_seed.sql         # بيانات تجريبية (تطوير فقط)
supabase/07_phase2.sql       # register_building RPC
supabase/08_phase5.sql       # apartments RPCs
supabase/09_phase6.sql       # payments hardening
supabase/10_phase7.sql       # expenses workflow
supabase/11_phase8.sql       # maintenance + tasks
supabase/12_phase9.sql       # vendors
supabase/13_phase10.sql      # governance
supabase/14_phase11.sql      # documents
supabase/15_phase12.sql      # financial reports
supabase/16_phase14.sql      # super-admin + subscriptions
```

> تفاصيل تطبيق SQL والـ Supabase CLI في [`supabase/README.md`](./supabase/README.md).

#### 4. عبّئ متغيرات البيئة

```bash
cp .env.example .env.local
```

افتح `.env.local` وضع القيم من Supabase Dashboard → **Project Settings → API**:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL=http://localhost:3000`

#### 5. شغِّل التطبيق

```bash
pnpm dev
```

افتح [http://localhost:3000](http://localhost:3000).

#### 6. سجِّل أول مستخدم وارفعه إلى `super_admin`

1. اذهب إلى `/register` وسجِّل حساباً.
2. في Supabase SQL Editor، نفِّذ:
   ```sql
   update public.profiles
   set is_super_admin = true
   where id = (select id from auth.users where email = 'YOUR_EMAIL@example.com');
   ```
3. سجّل خروج وأعد الدخول → ستُحوَّل تلقائياً إلى `/super-admin`.

أو استخدم بيانات seed (للتطوير فقط — كلمة موحَّدة `password123`):

| البريد | الدور |
|---|---|
| `super@imarah.test` | Super Admin |
| `admin1@imarah.test` | Admin |
| `treasurer1@imarah.test` | Treasurer |
| `resident1@imarah.test` | Resident |
| `technician1@imarah.test` | Technician |

> ⚠️ بيانات الـ seed للتطوير فقط. **لا تُشغِّل `06_seed.sql` في الإنتاج**.

---

## أوامر مفيدة

```bash
pnpm dev          # تطوير على :3000
pnpm build        # build إنتاج (مع PWA SW + postbuild checks)
pnpm start        # تشغيل الإنتاج
pnpm lint         # ESLint
pnpm typecheck    # TypeScript strict check

# اختبارات SQL تلقائية (pglite — لا يَحتاج Supabase حياً)
node scripts/sql-validate.mjs   # 226 اختباراً
```

---

## الأدوار والصلاحيات

كل عمارة لها 5 أدوار + super_admin (مالك المنصة):

| الدور | الصلاحيات الرئيسية |
|---|---|
| `admin` | إدارة كاملة لعمارة واحدة (شقق، مدفوعات، مصروفات، صيانة، تصويتات، توريد) |
| `treasurer` | المالية فقط (اعتماد مدفوعات، مصروفات، تقارير) |
| `committee` | عضو لجنة (يَنشئ اقتراحات/تصويتات، يَرى التقارير) |
| `resident` | يَرى شقته فقط، يَفتح طلبات صيانة، ممثل تصويت إن كان مُعيَّناً |
| `technician` | يَرى طلبات الصيانة المُسندة له فقط |
| `super_admin` | مالك المنصة — يَرى كل العمارات، يُدير الاشتراكات، لا يَظهر في building_switcher |

التفاصيل الكاملة + سيناريوهات كل دور في [PLAN.md §3](./PLAN.md).

---

## الـ Stack التقني

| الطبقة | التقنية |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript strict |
| Styling | Tailwind CSS 3 + shadcn/ui (Radix primitives) |
| Theme | next-themes (dark/light)، Tajawal font |
| Forms | react-hook-form + zod |
| DB / Auth / Storage | Supabase (Postgres + RLS + Storage) |
| Server Actions | Next.js native — كل mutations عبر `'use server'` |
| Charts | recharts |
| PWA | Serwist (`@serwist/next`) — production فقط |
| Icons | lucide-react |
| Notifications | sonner (toasts) |
| Local SQL Testing | PGlite (Postgres-via-WASM) |

---

## هيكلة المشروع

```
src/
  app/
    (auth)/              # login, register, forgot/reset password
    (app)/               # routes للمستخدمين العاديين
      apartments/
      payments/
      expenses/
      maintenance/
      tasks/
      vendors/
      suggestions/
      votes/
      decisions/
      documents/
      reports/financial/
      audit-logs/
      dashboard/
    (super-admin)/
      super-admin/
        buildings/[id]/
        users/
        audit/
    forbidden/
    subscription-inactive/
    sw.ts                # Service Worker source
    manifest.ts          # PWA manifest
    icon.tsx + apple-icon.tsx
    layout.tsx (root)
  components/
    ui/                  # shadcn/ui primitives
    shared/              # PageHeader, EmptyState, ConfirmDialog, ...
    layout/              # AppShell, Sidebar, BottomNav, BuildingSwitcher
    apartments/ payments/ expenses/ maintenance/ tasks/
    vendors/ suggestions/ votes/ decisions/
    super-admin/ documents/ audit/
  lib/
    supabase/            # client.ts, server.ts, middleware.ts, admin.ts
    queries/             # data fetching (server-side)
    permissions.ts       # requireUser, hasRole, isSuperAdmin
    tenant.ts            # active_building_id cookie management
    format.ts            # ar-SA-u-ca-gregory formatters
  actions/               # server actions per domain
  types/database.ts      # Supabase types (handwritten — sync to schema)
  middleware.ts          # auth + tenant + super_admin gates

supabase/                # SQL files 01-16 + README + seed
scripts/                 # sql-validate.mjs + check-sw-precache.mjs
public/                  # offline.html, icons, manifest, sw (generated)
```

---

## الوثائق

| الوثيقة | الجمهور |
|---|---|
| [README.md](./README.md) (هذا الملف) | المطورون — التشغيل المحلي |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | DevOps — النشر على Vercel + Supabase |
| [ADMIN_GUIDE.md](./ADMIN_GUIDE.md) | super_admin + admin — العمليات اليومية |
| [USER_GUIDE.md](./USER_GUIDE.md) | السكان — استخدام التطبيق |
| [CHANGELOG.md](./CHANGELOG.md) | الجميع — تاريخ التغييرات والدروس |
| [PLAN.md](./PLAN.md) | المستشار — وثيقة الإشراف الكاملة (15 مرحلة، 100/100) |
| [supabase/README.md](./supabase/README.md) | المطورون — تفاصيل تطبيق SQL والاختبارات الأمنية |

---

## النشر

نشر سريع على Vercel + Supabase: راجع [`DEPLOYMENT.md`](./DEPLOYMENT.md) (< 30 دقيقة من الصفر).

النقاط الأساسية:
1. أنشئ مشروع Supabase production (منفصل عن التطوير).
2. طبّق ملفات SQL `01-16` (تخطّى `06_seed.sql`).
3. اربط الـ repo بـ Vercel، اضبط متغيرات البيئة.
4. أنشئ أول `super_admin` يدوياً عبر SQL.

---

## الأمان

- **Row Level Security** على كل الجداول — لا تسرّب cross-tenant.
- **Composite FKs** على كل علاقة (`(building_id, child_id) → (building_id, child_id)`) لمنع cross-tenant references.
- **Workflow triggers** على كل جدول له حالات (transition whitelists + per-transition field whitelists).
- **Audit logs** غير قابلة للتعديل أو الحذف (immutability triggers).
- **Storage policies** row-scoped + tenant path validation.
- **226 اختباراً تلقائياً** عبر pglite في `scripts/sql-validate.mjs`.

سيناريوهات الأمان الأساسية موثَّقة في [supabase/README.md](./supabase/README.md#اختبارات-الأمان).

---

## المساهمة

المشروع حالياً في مرحلة post-Phase-15. ركّز التغييرات على:
- إصلاحات أخطاء بدون تَعديل schema (المرحلة الحالية مُغلقة 100/100).
- تحسينات UI/UX داخل المكونات الموجودة.
- وثائق إضافية (screenshots، أمثلة استخدام).

أي تغيير DB يَتطلَّب: SQL migration جديد + اختبارات pglite + توثيق في CHANGELOG.

---

## الترخيص

ملكية خاصة — المؤلف: باسم. حقوق محفوظة.

التواصل عبر [issues] للمسائل التقنية.
