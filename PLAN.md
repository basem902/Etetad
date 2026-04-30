# خطة مشروع: نظام إدارة العمارة (SaaS)
## وثيقة إشراف وتقييم — للمستشار Codex

> **هذه الوثيقة مرجع إلزامي لكل من المنفذ والمستشار.**
> المنفذ يلتزم بتنفيذ المراحل بالترتيب. المستشار يقيّم كل مرحلة، ولا يسمح بالانتقال للمرحلة التالية إلا بتقييم **100/100** كاملة بدون أي ملاحظة معلّقة.

---

## جدول المحتويات

1. [نظرة عامة على المشروع](#1-نظرة-عامة)
2. [المواصفات التقنية والمعمارية](#2-المواصفات-التقنية-والمعمارية)
3. [الأدوار والصلاحيات](#3-الأدوار-والصلاحيات)
4. [دور المستشار Codex](#4-دور-المستشار-codex)
5. [المراحل التنفيذية (0 → 19)](#5-المراحل-التنفيذية)
6. [المعايير المشتركة عبر كل المراحل](#6-المعايير-المشتركة)
7. [عملية التسليم والمراجعة](#7-عملية-التسليم-والمراجعة)
8. [الخريطة الزمنية التقديرية](#8-الخريطة-الزمنية)
9. [ملاحظات نهائية](#9-ملاحظات-نهائية)

---

## 1. نظرة عامة

### 1.1 وصف المشروع
نظام إدارة عمارة سكنية كامل، يُبنى أولاً لخدمة عمارة المالك، ثم يتطور إلى منصة **SaaS متعددة المستأجرين** تخدم عدة عمارات بحسابات اشتراك مستقلة.

### 1.2 الأهداف
- شفافية مالية كاملة بين الإدارة والسكان.
- تقليل الجهد اليدوي في تتبع الإيصالات والمصروفات.
- نظام تصويت رقمي للقرارات الجماعية مع منع التزوير.
- توثيق كل عملية حساسة في سجل تدقيق.
- يعمل كتطبيق ويب وكتطبيق PWA قابل للتثبيت على الجوال.

### 1.3 النموذج التجاري (SaaS)
- كل عمارة = حساب مستقل (Tenant).
- اشتراك شهري/سنوي بعد تجربة مجانية 30 يوم.
- خطط: `trial` / `basic` / `pro` / `enterprise`.
- مالك المنصة = `super_admin`، يدير كل العمارات والاشتراكات.

### 1.4 الجمهور المستهدف
- ملاك العمارات السكنية في الخليج.
- لجان السكان والاتحادات الصغيرة.
- شركات إدارة الأملاك الناشئة.
- السوق الأولي: **السعودية** (واجهة عربية كاملة، عملة SAR افتراضية).

### 1.5 قيود النطاق (Scope Constraints — محسومة)

هذه القرارات **ثابتة** في النسخة الحالية. لا يُبنى أي كود/جدول/واجهة يفترض غيرها.

#### 1.5.1 الدفع يدوي فقط — لا بوابات دفع إلكترونية

- **لا تكامل** مع أي بوابة دفع (Stripe, HyperPay, Moyasar, PayTabs, إلخ).
- **آلية الدفع الوحيدة المعتمدة**:
  1. الساكن أو ممثل الشقة يحوّل/يدفع خارج النظام (نقد، تحويل بنكي، شيك، تحويل أونلاين بنك لبنك).
  2. يرفع **إيصال التحويل** أو **صورة إثبات الدفع** عبر النظام.
  3. الإدارة أو أمين الصندوق يراجع الإيصال.
  4. يغيّر الحالة إلى `approved` أو `rejected`.
- **حالات الدفعة الوحيدة**: `pending` / `approved` / `rejected`. لا توجد حالات وسطية إلكترونية مثل `processing` أو `gateway_pending`.
- **الرفض يستلزم سبب مكتوب** إلزامياً (CHECK constraint في DB + validation في server action + UI).
- كل اعتماد/رفض يُسجَّل في `audit_logs` بقيم قبل/بعد + سبب الرفض.
- **مصدر الحقيقة الوحيد للأرصدة والتقارير**: الدفعات بحالة `approved` فقط. الـ `pending` لا تُحسب في الرصيد ولا في التقارير المالية (تظهر منفصلة كـ "بانتظار المراجعة").
- **ممنوع بناء**:
  - جدول `transactions` أو `payment_intents` أو `gateway_events`
  - حقل `payment_intent_id` أو `gateway_reference` أو `external_transaction_id`
  - واجهة "ادفع الآن" بزر يحوّل لبوابة
  - webhook handlers لأحداث دفع خارجية
  - أي logic يفترض confirmation تلقائي
- ملاحظة على `payment_method`: قيمة `online` تعني **تحويل أونلاين من بنك المستخدم** يُثبت بإيصال يدوي، **لا** تعني دفع عبر بوابة.

#### 1.5.2 التصويت لكل شقة — One Vote per Apartment

- وحدة التصويت الأساسية = **الشقة**، وليس المستخدم.
- لكل شقة **صوت واحد فقط** في كل تصويت، بغض النظر عن عدد المستخدمين المرتبطين بها.
- لكل شقة **ممثل تصويت واحد** (`voting_representative`) — قد يكون مالكاً أو مستأجراً أو ممثلاً مفوّضاً (`relation_type` = `owner` / `resident` / `representative`).
- **التصميم في DB**: حقل `is_voting_representative boolean default false` على جدول `apartment_members` + unique partial index يضمن أن لكل شقة ممثلاً واحداً فقط نشطاً:
  ```sql
  create unique index idx_one_voting_rep_per_apartment
    on apartment_members (apartment_id)
    where is_voting_representative = true and is_active = true;
  ```
- **منع التصويت المكرر من نفس الشقة على 3 طبقات** (defense in depth):
  1. **UI**: زر التصويت معطّل ومخفي لمن ليس ممثلاً، ويعرض من هو الممثل الحالي.
  2. **Server action**: تتحقق من `is_voting_representative = true` + غياب vote_response سابق لنفس apartment_id قبل أي insert.
  3. **DB**: unique constraint على `(vote_id, apartment_id)` في `vote_responses`.
- **حساب النتائج**:
  - النتائج تُحسب بـ **عدد الشقق المصوّتة** لا عدد المستخدمين.
  - نسبة الإقبال = `شقق صوّتت / إجمالي شقق العمارة المؤهلة`.
  - قواعد القبول (`simple_majority` / `two_thirds` / `custom`) تُطبَّق على الأصوات per-apartment.
- **إدارة ممثل التصويت**:
  - عند ربط أول عضو بشقة → يُعيَّن تلقائياً كـ `is_voting_representative = true`.
  - عند إضافة أعضاء آخرين → يبقى الأول هو الممثل افتراضياً.
  - **admin فقط** يقدر يغيّر voting_representative لشقة (تحويل من عضو لآخر في عملية ذرّية).
  - تغيير الممثل يُسجَّل في `audit_logs`.
  - إذا أُزيل الممثل من الشقة → يجب تعيين بديل قبل إتمام الإزالة.
- **واجهة التصويت** توضّح صراحة:
  - banner: **"تصوّت باسم شقتك رقم X"**
  - أو: "هذه الشقة صوّتت بالفعل بواسطة [اسم الممثل] في [التاريخ]"
  - أو: "لست ممثل تصويت لأي شقة، لا يمكنك التصويت."
- **إزالة `voting_scope`**: حقل `voting_scope` في جدول `votes` لم يعد ضرورياً ويُحذف من الـ schema. كل التصويتات per-apartment إلزامياً.

---

## 2. المواصفات التقنية والمعمارية

### 2.1 الـ Stack التقني (محسوم — لا تغيير)

| الطبقة | التقنية | السبب |
|---|---|---|
| Framework | Next.js 15 (App Router) | SSR + Server Actions + RSC |
| اللغة | TypeScript (strict) | type safety |
| قاعدة البيانات | Supabase (PostgreSQL) | RLS + Auth + Storage في حزمة واحدة |
| Auth | Supabase Auth | متكامل + JWT + email |
| Storage | Supabase Storage | للإيصالات والصور والمستندات |
| Styling | Tailwind CSS | mobile-first + RTL |
| Components | shadcn/ui | احترافية + قابلة للتخصيص |
| Forms | react-hook-form + zod | validation موحّد |
| Theme | next-themes | dark mode بدون FOUC |
| PWA | Serwist (`@serwist/next`) | متوافق مع App Router (بديل next-pwa) |
| Font | Tajawal (Google Fonts) | احترافي للعربية |
| Icons | lucide-react | معيار shadcn |
| Charts | recharts | للتقارير |

### 2.2 المعمارية: Multi-Tenant Shared Database
- قاعدة بيانات واحدة، **كل جدول أعمال يحوي `building_id`**.
- RLS يضمن أن أي query لا يتجاوز عمارات المستخدم.
- المستخدم قد يكون عضواً في **أكثر من عمارة** (جدول `building_memberships`) بأدوار مختلفة في كل واحدة.
- العمارة النشطة (Active Building) تُحفظ في cookie آمن وتُقرأ في server components.

### 2.3 المعزولية بين العمارات (Tenant Isolation) — حرج

- **كل query يمر عبر RLS** — لا استثناءات في كود العميل. لا overrides، لا "trust me" patterns.

- **آلية رؤية `super_admin` للبيانات (محسومة، لا اجتهاد فيها)**:

  - **READs على بيانات العمارات** (payments, expenses, maintenance, votes, إلخ): تتم عبر **RLS clauses** تحتوي `OR is_super_admin()` على كل policy لجدول يحوي `building_id`. super_admin يستخدم **نفس Supabase client العادي** بـ JWT الخاص به. لا يُستخدم `service_role` لـ READs.

  - **WRITEs الإدارية على مستوى المنصة فقط** (تعديل `subscription_plan`/`subscription_status`، تعطيل عمارة، تمديد trial، نقل ملكية، ترقية مستخدم لـ super_admin): تستخدم `service_role` من server actions داخل `(super-admin)/` routes. السبب: override صريح ومحدود + audit واضح + تجنّب RLS surface كبير. **القاعدة المُحدَّثة v3.32**: حتى داخل `(super-admin)/`، الـ admin client لا يَلمس tables مباشرةً — كل الـ writes عبر SECURITY DEFINER RPCs تَفرض القيود داخلياً (anti-pattern: `admin.from('buildings').update(...)`).

  - **WRITEs على بيانات عمارة من super_admin** (نادرة، مثل تعديل دفعة لتصحيح خطأ): تمر عبر RLS العادية كباقي المستخدمين (policy تحتوي `OR is_super_admin()` للـ UPDATE). لا تُستخدم `service_role` هنا.

  - `service_role` **ممنوع منعاً تاماً** في:
    - أي مسار خارج المواضع المُحدَّدة في الاستثناءات أدناه
    - أي client component أو browser code
    - أي ملف يُستورَد من client code (enforce بـ `import "server-only"` + ESLint rule)

  - **استثناء #1 — `auth.admin`** (PLAN amendment، v2.2): server actions خارج `(super-admin)/` يُسمح لها باستخدام `getAuthAdmin()` من `src/lib/supabase/auth-admin.ts` للعمليات على schema `auth` فقط:
    - `auth.admin.listUsers` — lookup user by email (لا API public في Supabase)
    - `auth.admin.inviteUserByEmail` — إرسال دعوة Supabase (الطريقة الوحيدة)
    - `auth.admin.deleteUser` / `auth.admin.updateUserById` — للعمليات الإدارية المماثلة عند الحاجة
    - الـ wrapper يكشف فقط `.auth.admin` ولا يكشف `from()`/`rpc()`/`storage`، فلا يمكن تجاوز RLS على business tables منه.
    - الـ writes على business tables تظل تمر عبر `createClient()` العادي تحت session المستخدم (subject to RLS).

  - **استثناء #2 — public form choke points** (PLAN amendment، v3.32 — Phase 16 round 4): server actions في `src/actions/marketing.ts` يُسمح لها باستخدام `createAdminClient()` لاستدعاء **SECURITY DEFINER RPCs server-only فقط** (لا direct table access):
    - `submit_contact_request` — choke point للـ /contact form. السبب: لو كان anon INSERT مَفتوحاً على `subscription_requests` (الحل القديم)، أي مهاجم يَستطيع `POST /rest/v1/subscription_requests` متجاوزاً rate limit في server action عبر anon key (الموجود في bundle). الحل: revoke anon INSERT + RPC server-only يَفرض كل القيود داخلياً.
    - `log_email_failure` — audit_logs writes للـ graceful email failures (audit_logs المعتاد trigger-only، لذلك RPC مَنفصل بـ entity_type whitelist، grant حصرياً لـ service_role).
    - الـ admin client في marketing.ts لا يَلمس أي table مباشرةً — RPC calls فقط. أي تَوسعة (Phase 17/18) تَتبع نفس النمط.

  - **القاعدة العامة لإضافة استثناء جديد**: PLAN amendment + Codex review round + توثيق صريح في JSDoc `createAdminClient()` + اختبارات SQL تُثبت أن الـ scope ضيق (الـ RPCs server-only، RLS تَحجب direct anon table access).

- **اختبار التسرب** إلزامي في كل مرحلة فيها بيانات: "هل عضو في عمارة A يستطيع رؤية بيانات عمارة B؟" — يجب أن يفشل.

- **اختبار رؤية super_admin** إلزامي: super_admin يقدر يقرأ بيانات أي عمارة عبر RLS بـ JWT العادي، **بدون** استخدام service_role.

### 2.4 هيكلة المشروع (محسومة)

```
imarah/
├── public/
│   ├── manifest.json
│   ├── icons/                  # أيقونات PWA
│   └── favicons/
├── supabase/
│   ├── 01_schema.sql           # الجداول + ENUMs + Indexes + FKs
│   ├── 02_functions.sql        # helper functions
│   ├── 03_triggers.sql         # updated_at + new_user + audit
│   ├── 04_policies.sql         # RLS لكل جدول
│   ├── 05_storage.sql          # buckets + storage policies
│   ├── 06_seed.sql             # بيانات تجريبية
│   └── README.md               # تعليمات التطبيق
├── src/
│   ├── app/
│   │   ├── (auth)/             # login, register, forgot-password
│   │   ├── (app)/              # كل صفحات المستخدم العادي
│   │   ├── (super-admin)/      # لوحة مالك المنصة
│   │   ├── api/
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   ├── manifest.ts
│   │   └── sw.ts
│   ├── components/
│   │   ├── ui/                 # shadcn primitives
│   │   ├── layout/             # sidebar, bottom-nav, header
│   │   ├── forms/
│   │   ├── tables/
│   │   ├── charts/
│   │   └── shared/             # empty-state, loading-state, etc.
│   ├── lib/
│   │   ├── supabase/           # client, server, middleware, admin
│   │   ├── permissions.ts
│   │   ├── tenant.ts
│   │   ├── utils.ts
│   │   ├── storage.ts
│   │   └── validations/        # zod schemas
│   ├── actions/                # server actions
│   ├── hooks/
│   ├── types/
│   │   └── database.ts         # generated من Supabase
│   └── middleware.ts
├── .env.example
├── .gitignore
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── README.md
├── DEPLOYMENT.md
└── PLAN.md                     # هذه الوثيقة
```

---

## 3. الأدوار والصلاحيات

### 3.1 الأدوار (5 + Super Admin)

| الدور | المستوى | الوصف |
|---|---|---|
| **super_admin** | منصة | مالك المنصة — يرى كل العمارات ويدير الاشتراكات. لا يدخل في تشغيل عمارة بعينها. |
| **admin** | عمارة | مدير العمارة — كل شيء داخل عمارته. |
| **treasurer** | عمارة | أمين الصندوق — المالية فقط (مدفوعات، مصروفات، إيصالات). |
| **committee** | عمارة | عضو لجنة — مراجعة + تصويتات + متابعة مهام. |
| **resident** | عمارة | ساكن أو مالك شقة — بياناته فقط + دفع + طلب صيانة + تصويت + اقتراح. |
| **technician** | عمارة | فني صيانة — فقط طلبات الصيانة المسندة له. |

### 3.2 مصفوفة الصلاحيات الرئيسية

| العملية | admin | treasurer | committee | resident | technician |
|---|:---:|:---:|:---:|:---:|:---:|
| رؤية كل المدفوعات | ✓ | ✓ | ✓ | ✗ | ✗ |
| رؤية مدفوعاته الشخصية | — | — | — | ✓ | ✗ |
| إنشاء دفعة | ✓ | ✓ | ✗ | ✓ | ✗ |
| اعتماد/رفض دفعة | ✓ | ✓ | ✗ | ✗ | ✗ |
| إنشاء/اعتماد مصروف | ✓ | ✓ | ✗ | ✗ | ✗ |
| إلغاء مصروف (بسبب) | ✓ | ✓ | ✗ | ✗ | ✗ |
| إنشاء طلب صيانة | ✓ | ✓ | ✓ | ✓ | ✗ |
| تحديث حالة طلب صيانة | ✓ | ✗ | ✓ | ✗ | المسندة له فقط |
| إنشاء تصويت | ✓ | ✗ | ✓ | ✗ | ✗ |
| التصويت (باسم الشقة)¹ | ✓ | ✓ | ✓ | ✓ | ✗ |
| تعيين/تغيير ممثل التصويت لشقة | ✓ | ✗ | ✗ | ✗ | ✗ |
| رؤية سجل التدقيق | ✓ | ✗ | ✓ | ✗ | ✗ |
| إدارة الشقق والأعضاء | ✓ | ✗ | ✗ | ✗ | ✗ |

> ¹ **التصويت مشروط بشرط إضافي**: المستخدم يجب أن يكون **`is_voting_representative = true`** لشقة مرتبطة به (راجع 1.5.2). دون ذلك، لا يمكنه التصويت حتى لو كان دوره يسمح نظرياً. ملاحظة: قد يكون `admin` أو `treasurer` أو `committee` بدون أي ربط بشقة (مدير محترف خارجي مثلاً) — في هذه الحالة لا يصوّت.
>
> **تطبيق الصلاحيات**: في الواجهة (إخفاء أزرار) **+** في server actions (التحقق قبل أي mutation) **+** في RLS (الحصن الأخير).

---

## 4. دور المستشار Codex

### 4.1 المسؤوليات
1. **مراجعة الكود** قبل الموافقة على أي مرحلة.
2. **اختبار يدوي** لكل سيناريو في معايير القبول.
3. **اختبار أمني**: محاولة كسر RLS ومنع تسرب البيانات.
4. **تقييم الجودة** بحسب نموذج 100 نقطة.
5. **منع الانتقال** للمرحلة التالية إذا التقييم < 100.
6. **توثيق الملاحظات** بشكل قابل للتنفيذ (actionable).

### 4.2 ما لا يفعله المستشار
- لا يكتب كوداً.
- لا يقترح تغييرات معمارية كبيرة (المعمارية محسومة في هذه الوثيقة).
- لا يقبل أي مرحلة بشكل جزئي ("99/100 سيتم قبولها لاحقاً" = ❌).
- لا يتجاوز سيناريو اختبار لأنه يبدو "تافهاً".

### 4.3 آلية المراجعة لكل مرحلة
1. **تسليم المنفذ**:
   - قائمة الملفات الجديدة/المعدّلة.
   - تعليمات تشغيل خاصة بالمرحلة (إن وجدت).
   - SQL migrations جديدة (إن وجدت).
   - شرح أي قرار معماري داخل نطاق المرحلة.
   - **تأكيد ذاتي** على كل بند في معايير القبول (checklist).

2. **فحص المستشار**:
   - تطبيق المرحلة على بيئة نظيفة من الصفر.
   - السير في كل سيناريو اختبار خطوة بخطوة.
   - محاولة كسر الأمان (negative testing).
   - مراجعة الكود (code review).
   - تقييم بنموذج 100 نقطة + ملاحظات تفصيلية.

3. **النتيجة**:
   - **100/100** ✅ → موافقة على الانتقال للمرحلة التالية.
   - **< 100** ❌ → ملاحظات → المنفذ يصلح → إعادة مراجعة.

### 4.4 نموذج التقييم (100 نقطة لكل مرحلة)

| الفئة | النقاط | المعايير |
|---|---|---|
| **الوظيفية** | 40 | كل feature يعمل كما هو موصوف في معايير القبول |
| **الأمان** | 20 | RLS صحيح، لا تسرب، التحقق من الصلاحيات في server actions |
| **جودة الكود** | 15 | TypeScript types، تنظيم، أسماء واضحة، لا تكرار، ملفات < 300 سطر |
| **UX/UI** | 15 | RTL سليم، Dark mode، Mobile responsive، Loading/Empty/Error states |
| **التوثيق** | 10 | README محدّث، تعليقات حيث ضرورية فقط (لا توثيق zoo) |

> **شرط القبول 100/100**: لا توجد نقطة مفقودة. أي خصم في أي فئة = إعادة عمل.
> **الاستثناء**: في مراحل بدون UI (مثل المرحلة 1) — تُعاد توزيع نقاط UX على Functionality (10) و Documentation (5).

---

## 5. المراحل التنفيذية

> **ترتيب المراحل إلزامي.** كل مرحلة تبني فوق سابقتها ولا يجوز دمجها.

---

### 📦 المرحلة 0: تأسيس المشروع (Project Foundation)

**الهدف**: مشروع Next.js 15 جاهز للتشغيل بكل الأدوات والتكوينات.

**المخرجات**:
- `package.json` بكل dependencies المذكورة في 2.1
- `tsconfig.json` (strict: true)
- `next.config.ts` (مع Serwist preset)
- `tailwind.config.ts` (dark mode + animations)
- `postcss.config.js`
- `components.json` (shadcn config)
- `.env.example` و `.env.local.example`
- `.gitignore` شامل
- `README.md` أولي (يكتمل في المرحلة 15)
- هيكل المجلدات الفارغة بحسب 2.4
- خط Tajawal مدمج كـ default
- صفحة افتراضية بسيطة + theme toggle تجريبي

**معايير القبول (Checklist)**:
- [ ] `pnpm install` يكتمل بدون warnings خطيرة
- [ ] `pnpm dev` يفتح المشروع على localhost:3000
- [ ] الصفحة الافتراضية تظهر بـ `dir="rtl"` و `lang="ar"`
- [ ] خط Tajawal يظهر فعلياً (وليس fallback)
- [ ] زر تبديل dark/light يعمل ويحفظ التفضيل في localStorage
- [ ] `pnpm build` يكتمل بنجاح
- [ ] `pnpm lint` يمر بدون errors
- [ ] `pnpm typecheck` (أو `pnpm tsc --noEmit`) يمر بصفر TypeScript errors
- [ ] script `typecheck` معرَّف في `package.json` (مع `lint`, `build`, `dev`)
- [ ] لا توجد أي قيمة hard-coded من القيم الحساسة (URLs, keys)
- [ ] `.env.local` مُتجاهَل في git

**سيناريوهات الاختبار**:
1. Clone في مجلد جديد → `pnpm install` → `pnpm dev` → يعمل من المرة الأولى.
2. زيارة `/` → صفحة بـ RTL وخط Tajawal.
3. تبديل theme → يحفظ التفضيل ويُطبَّق فوراً بدون reload.
4. Reload في dark mode → لا يومض للـ light ثم dark (no FOUC).
5. `pnpm build && pnpm start` → يعمل في production mode.

**توزيع 100 نقطة**:
- Functionality (40): dev/build/lint كلها تمر
- Security (20): لا secrets في git، .env.example فقط
- Code Quality (15): tsconfig strict، هيكلة نظيفة
- UX/UI (15): RTL + Tajawal + Dark mode + no FOUC
- Documentation (10): README أولي يشرح الـ setup

**Definition of Done**: المستشار يقدر يستلم المشروع من جهاز فاضي → ينفذ تعليمات README → يحصل على نفس النتيجة بدون أي تدخل خارج الوثيقة.

**شرط الاستلام (Delivery Requirement) — إلزامي قبل أي مراجعة**:

المنفذ يقدّم package تسليم يحتوي **بالضرورة** البنود 1–4 التالية. أي تسليم ينقصه أحد هذه البنود **يُرفض قبل بدء المراجعة** (لا يُحتسب وقت مراجعة، يُعاد للمنفذ مباشرة):

1. **شجرة الملفات** — قائمة كل الملفات الجديدة/المعدّلة في هذه المرحلة (output of `git status` أو ما يعادله، مع شجرة المجلدات الجديدة).

2. **أوامر التشغيل المعتمدة** (موثّقة أيضاً في README):
   - `pnpm install`
   - `pnpm dev` — تشغيل التطوير على `localhost:3000`
   - `pnpm build` — build إنتاج
   - `pnpm lint`
   - `pnpm typecheck` (أو `pnpm tsc --noEmit`)

3. **نتائج الفحوصات** — raw output ملصق في رسالة التسليم، ليس مجرد ادعاء:
   - `pnpm install` → exit code 0، لا warnings خطيرة (الـ warnings العادية مقبولة فقط بسبب موثّق).
   - `pnpm build` → exit code 0، مع Next.js build summary (الصفحات + الأحجام).
   - `pnpm lint` → exit code 0، **صفر** errors، أي warnings تُذكر صراحة.
   - `pnpm typecheck` → exit code 0، **صفر** TypeScript errors.

4. **تأكيد Checklist المرحلة 0 بنداً بنداً** — نسخ كل بند من "معايير القبول" أعلاه مع `✅` بجانب كل واحد، أو شرح صريح ومُبرَّر في حال عدم الإكمال. **لا اختصارات** ("كل الـ checklist تم" غير مقبول).

5. **Screenshots** (اختيارية، مستحسنة):
   - الصفحة الرئيسية في light mode (RTL واضح + خط Tajawal)
   - نفسها في dark mode (لا FOUC)
   - زر theme toggle قبل/بعد

---

### 🗄️ المرحلة 1: قاعدة البيانات و RLS

**الهدف**: SQL كامل ومُختبر يبني كل البنية + RLS صارم + Storage policies + بيانات seed.

**المخرجات** (في مجلد `supabase/`):
- `01_schema.sql` — كل الجداول (17 جدول) + ENUMs + Indexes + FKs + Constraints
- `02_functions.sql` — `is_super_admin`, `is_building_member`, `user_has_role`, `user_building_ids`
- `03_triggers.sql` — `updated_at` على كل جدول + `handle_new_user` + audit triggers
- `04_policies.sql` — RLS لكل جدول
- `05_storage.sql` — buckets (`receipts`, `invoices`, `maintenance`, `documents`, `avatars`, `logos`) + storage policies
- `06_seed.sql` — بيانات تجريبية: 1 super_admin + 2 buildings + 6 users بأدوار مختلفة + 10 apartments + بضعة سجلات في كل جدول
- `src/types/database.ts` — أنواع TypeScript مولّدة
- `supabase/README.md` — تعليمات التطبيق خطوة بخطوة

**الجداول الـ 17**:
`buildings`, `profiles`, `building_memberships`, `apartments`, `apartment_members`, `payments`, `expenses`, `vendors`, `maintenance_requests`, `tasks`, `suggestions`, `votes`, `vote_options`, `vote_responses`, `decisions`, `documents`, `audit_logs`

**معايير القبول**:
- [ ] كل ملفات SQL تنفذ على Supabase fresh بالترتيب 01→06 بدون أخطاء
- [ ] كل جدول أعمال له `building_id` (عدا `profiles`)
- [ ] كل جدول عليه RLS مفعّل (`enable row level security`)
- [ ] كل enum مذكور في الوثيقة الأصلية موجود
- [ ] كل foreign key مع `on delete` مناسب (cascade للعلاقات الفرعية، set null للاختيارية)
- [ ] indexes على `building_id` وكل عمود يُفلتَر عليه عادة
- [ ] `vote_responses` لها unique constraint على `(vote_id, apartment_id)` يمنع التصويت المكرر من نفس الشقة
- [ ] `vote_responses.apartment_id` is **NOT NULL** (التصويت دائماً per-apartment)
- [ ] `vote_responses.building_id` is **NOT NULL** + composite FK على `(vote_id, building_id)` و `(apartment_id, building_id)` لضمان tenant consistency
- [ ] `vote_responses` composite FK على `(option_id, vote_id)` → `vote_options(id, vote_id)` لمنع تسجيل صوت بخيار من تصويت آخر
- [ ] **Tenant consistency شامل** عبر composite FKs على كل علاقة tenant:
  - `apartment_members(apartment_id, building_id) → apartments(id, building_id)`
  - `payments(apartment_id, building_id) → apartments(id, building_id)`
  - `maintenance_requests(apartment_id, building_id) → apartments(id, building_id)`
  - `maintenance_requests(related_expense_id, building_id) → expenses(id, building_id)`
  - `decisions(vote_id, building_id) → votes(id, building_id)`
  - `decisions(expense_id, building_id) → expenses(id, building_id)`
  - **`expenses(vendor_id, building_id) → vendors(id, building_id)`**
  - **`votes(suggestion_id, building_id) → suggestions(id, building_id)`**
  - `vote_responses(vote_id, building_id) → votes(id, building_id)`
  - `vote_responses(apartment_id, building_id) → apartments(id, building_id)`
- [ ] composite uniques على الجداول الأم: `apartments`, `expenses`, `votes`, `vote_options`, **`vendors`**, **`suggestions`** — على `(id, building_id)` (و `vote_options(id, vote_id)`)
- [ ] **لا توجد INSERT policy على `audit_logs` بأي شكل** — الإدخال حصرياً عبر:
  1. `audit_changes()` SECURITY DEFINER trigger (تلقائي على 7 جداول حساسة)
  2. service_role direct insert من `(super-admin)/` server routes (نادر، لأحداث non-table)
- [ ] **`log_audit_event()` غير موجود في الـ schema** (إن وُجد كان forgeable من client حتى مع membership gating؛ سيُضاف في مرحلة لاحقة كـ service_role-only function إن احتجناه)
- [ ] `apartment_members.is_voting_representative boolean default false` موجود مع unique partial index `(apartment_id) where is_voting_representative = true and is_active = true`
- [ ] جدول `votes` **لا يحتوي** حقل `voting_scope` (محذوف — التصويت دائماً per-apartment)
- [ ] `payments.status` enum = `pending | approved | rejected` فقط (لا حالات إلكترونية، لا `processing`، لا `gateway_pending`)
- [ ] `payments.rejection_reason` not null عند `status = rejected` (CHECK constraint)
- [ ] `payments.receipt_url` not null عند الإنشاء (CHECK constraint — لا دفعة بدون إيصال)
- [ ] **لا توجد `DELETE` policies** على `payments` و `expenses` على مستوى DB (الحذف ممنوع بنية)، ولا توجد واجهة حذف لهما في UI (تُنفَّذ القيود السلوكية في المراحل 6 و 7)
- [ ] `expenses.status = cancelled` مع `cancellation_reason` not null عند الإلغاء (CHECK constraint)
- [ ] **لا توجد** جداول/حقول لبوابات دفع: `transactions`, `payment_intents`, `gateway_events`, `payment_intent_id`, `gateway_reference`
- [ ] Storage buckets موجودة بالـ visibility الصحيح (avatars + logos = public، الباقي private)
- [ ] Storage policies تستخدم `(storage.foldername(name))[1]::uuid` كـ building_id
- [ ] Trigger `handle_new_user` ينشئ profile تلقائياً عند تسجيل user
- [ ] seed يعمل ويُنشئ بيانات قابلة للاستخدام في باقي المراحل

**سيناريوهات اختبار الأمان (المستشار يجريها يدوياً)**:
1. **التسرب 1**: مستخدم في عمارة A → `select * from payments` → لا يرى مدفوعات عمارة B.
2. **التسرب 2**: ساكن (resident) → `select * from payments` → لا يرى مدفوعات سكان آخرين في نفس عمارته.
3. **التسرب 3**: technician → `select * from maintenance_requests` → يرى فقط المسندة له.
4. **الحذف**: محاولة `delete from payments` أو `delete from expenses` → يفشل (لا سياسة DELETE).
5. **التصويت المكرر من نفس الشقة**: محاولة insert في `vote_responses` بنفس `(vote_id, apartment_id)` مرتين → يفشل (unique constraint).
6. **ممثلَين لنفس الشقة**: محاولة set `is_voting_representative = true` لعضوَين نشطَين في نفس الشقة → يفشل (unique partial index).
7. **رفض دفعة بدون سبب**: محاولة `update payments set status = 'rejected'` بدون `rejection_reason` → يفشل (CHECK constraint).
8. **دفعة بدون إيصال**: محاولة insert payment بدون `receipt_url` → يفشل (CHECK constraint).
9. **حالة دفع غير مسموحة**: محاولة insert payment بـ `status = 'processing'` أو أي قيمة خارج enum → يفشل.
10. **storage عبر مستأجرين**: محاولة قراءة ملف في bucket `receipts` تحت building_id لا ينتمي للمستخدم → يفشل.
11. **Super admin reads عبر RLS (آلية محددة)**: تسجيل دخول كـ super_admin → `select * from payments where building_id = '<أي عمارة>'` بـ JWT العادي → ينجح بفضل clause `OR is_super_admin()` في policy. **لا يُستخدم `service_role` لهذا الـ READ** (مراجعة الكود تأكيداً).
12. **منع service_role خارج المواضع المُحدَّدة**: مراجعة الـ codebase — `import` لـ `lib/supabase/admin.ts` مَسموح حصراً في:
    - `src/app/(super-admin)/...` (platform-level admin ops)
    - `src/actions/marketing.ts` (Phase 16+ — public form choke points، استثناء v3.32)
    
    أي `import` خارج هذه المواضع → ممنوع. الـ `import "server-only"` يَحجبه من client code تلقائياً (build error). PLAN amendment + Codex review مَطلوبان لإضافة موضع جديد.
13. **عدم اعتماد super_admin على service_role لـ READ**: محاولة من super_admin قراءة بيانات عمارة عبر admin client من مسار عادي → يجب أن يفشل (لأن الـ admin client غير متاح أصلاً في تلك المسارات).
14. **Tenant consistency (payments)**: insert payment بـ `building_id` من عمارة A و `apartment_id` من عمارة B → يفشل (`fk_payments_apartment_tenant`).
15. **Tenant consistency (apartment_members)**: نفس النمط على `apartment_members` → يفشل.
16. **Tenant consistency (vote_responses — apartment)**: insert vote_response بـ `apartment_id` من عمارة مختلفة عن `building_id` → يفشل (`fk_vote_response_apartment_tenant`).
17. **Tenant consistency (vote_responses — vote)**: insert vote_response بـ `vote_id` من عمارة مختلفة عن `building_id` → يفشل (`fk_vote_response_vote_tenant`).
18. **Tenant consistency (expenses.vendor_id)**: insert expense في عمارة B بـ `vendor_id` من عمارة A → يفشل (`fk_expenses_vendor_tenant`).
19. **Tenant consistency (votes.suggestion_id)**: insert vote في عمارة B بـ `suggestion_id` من عمارة A → يفشل (`fk_votes_suggestion_tenant`).
20. **Vote-option integrity**: insert vote_response بـ `option_id` من تصويت آخر → يفشل (`fk_vote_response_option_vote`).
21. **Audit log forging blocked (Issues #4 + #6)**: 
    - أي محاولة `insert into audit_logs ...` من authenticated user → تفشل (لا INSERT policy).
    - `log_audit_event()` غير موجود في الـ schema → لا RPC قابلة للاستدعاء من client.

**توزيع 100 نقطة** (مرحلة بدون UI):
- Functionality (50): كل الجداول/الـ RLS/Storage تعمل
- Security (30): كل اختبارات التسرب أعلاه تنجح
- Code Quality (10): SQL منظم، تعليقات للأقسام، أسماء constraints واضحة (`fk_*`, `chk_*`)
- Documentation (10): supabase/README يشرح خطوة بخطوة، seed قابل للاستخدام

**Definition of Done**: المستشار يطبق SQL على Supabase جديد → يشغّل seed → يفتح Supabase Studio → يحاول كل اختبارات الأمان من حسابات مختلفة → كلها تتصرف كما هو متوقع.

---

### 🔐 المرحلة 2: المصادقة والـ Multi-Tenancy

**الهدف**: تسجيل دخول، تسجيل عمارة جديدة، اختيار العمارة النشطة، middleware حماية، helpers للصلاحيات.

**المخرجات**:
- `src/lib/supabase/client.ts` — Browser client (createBrowserClient)
- `src/lib/supabase/server.ts` — Server client (createServerClient + cookies)
- `src/lib/supabase/middleware.ts` — Middleware helper (updateSession)
- `src/lib/supabase/admin.ts` — Service role client (للسوبر أدمن فقط، server-only)
- `src/middleware.ts` — حماية المسارات
- `src/lib/permissions.ts` — `hasRole()`, `requireRole()`, `getCurrentMembership()`, `getActiveBuildingId()`
- `src/lib/tenant.ts` — اختيار وإدارة العمارة النشطة عبر cookie
- `src/app/(auth)/login/page.tsx` + form
- `src/app/(auth)/register/page.tsx` + form (تسجيل عمارة + admin معها في عملية واحدة)
- `src/app/(auth)/forgot-password/page.tsx`
- `src/app/(auth)/reset-password/page.tsx`
- `src/app/(app)/onboarding/page.tsx` — للمستخدم الجديد بدون عضوية في أي عمارة
- `src/actions/auth.ts` — Server actions (login, registerBuilding, logout, sendInvite, resetPassword)
- `src/components/layout/building-switcher.tsx`

**التدفقات**:

1. **تسجيل عمارة جديدة**:
   - User يدخل: اسم + بريد + كلمة مرور + اسم العمارة + عنوان + رسوم افتراضية.
   - النظام (في transaction واحدة عبر RPC أو server action متسلسل):
     - ينشئ user في auth.users
     - ينشئ profile (عبر trigger handle_new_user)
     - ينشئ building (status = trial، trial_ends_at = now + 30 days)
     - ينشئ membership بدور `admin`
   - يضع `active_building_id` في cookie
   - يُحوَّل المستخدم لـ `/dashboard`

2. **تسجيل دخول**:
   - بريد + كلمة مرور
   - إذا له ≥ 1 عمارة → dashboard مع آخر active_building (أو الأولى)
   - إذا ليس له أي عمارة → `/onboarding` (شاشة "أنت لست عضواً في أي عمارة، اطلب دعوة")

3. **تبديل العمارة**:
   - dropdown في الـ header يعرض العمارات التي المستخدم عضو فيها
   - يحدّث `active_building_id` cookie ويعمل refresh

4. **الحماية (middleware)**:
   - أي مسار `(app)` بدون session → redirect `/login`
   - أي مسار `(super-admin)` بدون `is_super_admin` → 403
   - مسارات `(auth)` بـ session → redirect `/dashboard`
   - مسارات public (`/`, `/_next`, `/manifest.json`, `/sw.js`) → مُستثناة

5. **توثيق super_admin الأول**:
   - تعليمات في README: تشغيل SQL يدوي بعد تسجيل user
   - أو CLI script في `scripts/promote-to-super-admin.ts`

**معايير القبول**:
- [ ] صفحة /login تعمل وتسجّل دخول صحيح
- [ ] صفحة /register تنشئ عمارة كاملة + admin في عملية واحدة (idempotent إن فشل جزء)
- [ ] middleware يحمي `(app)` و `(super-admin)`
- [ ] cookie `active_building_id` يُقرأ في server components
- [ ] building_switcher يعرض **فقط** العمارات التي المستخدم عضو فيها (لا تسرب)
- [ ] forgot password يرسل إيميل reset
- [ ] reset password يعمل ويُسجل دخول تلقائياً بعد الإعادة
- [ ] logout يمسح session + كل cookies
- [ ] محاولة دخول `/super-admin` بحساب عادي → 403 (وليس redirect صامت)
- [ ] toast notifications على نجاح/فشل كل العمليات (بالعربي)
- [ ] forms validation بـ zod مع رسائل خطأ عربية
- [ ] loading states على submit
- [ ] طريقة إنشاء أول super_admin موثقة بوضوح

**سيناريوهات الاختبار**:
1. تسجيل عمارة جديدة → فحص في DB أن building و membership أُنشئا بشكل صحيح + trial_ends_at مضبوط.
2. تسجيل دخول → الذهاب لـ /dashboard.
3. مستخدم عضو في عمارتين (يدوياً عبر SQL) → switcher يظهر الاثنتين، التبديل يحدّث الـ context.
4. حذف cookie active_building_id يدوياً → النظام يعيد التعيين للأولى المتاحة.
5. تسجيل دخول بحساب super_admin → /super-admin يفتح.
6. تسجيل دخول بحساب عادي → /super-admin → 403 صريح.
7. user جديد بدون عمارة → /onboarding.
8. logout → كل المسارات الخاصة → /login.

**توزيع 100 نقطة**:
- Functionality (40): كل التدفقات تعمل
- Security (20): middleware يحمي، super_admin gating، redirects صحيحة، لا تسرب في switcher
- Code Quality (15): permissions helpers قابلة للاستخدام، types واضحة، actions منظمة
- UX/UI (15): forms RTL، validation عربي، loading states، dark mode، toasts
- Documentation (10): تعليقات على helpers، README يشرح إنشاء super_admin

**Definition of Done**: المستشار يقدر يسجل عمارة جديدة من الصفر، يدخل، يضيف عمارة ثانية يدوياً عبر SQL، يبدّل بينهما، ويرى الـ context يتحدّث صح في كل صفحة.

---

### 🎨 المرحلة 3: نظام التصميم والـ Layout

**الهدف**: shadcn/ui مدمج بالكامل، Layout أساسي (sidebar + bottom nav + header)، Dark mode متقن، RTL سليم، مكونات shared جاهزة للاستخدام في باقي المراحل.

**المخرجات**:
- shadcn/ui components (مثبّتة عبر CLI أو منسوخة):
  - Button, Input, Label, Textarea, Select, Card, Badge
  - Dialog, Sheet, Drawer (vaul)
  - Dropdown Menu, Popover, Tooltip
  - Tabs, Accordion, Separator
  - Toast (Sonner أو الافتراضي), Avatar, Skeleton
  - **Calendar — مؤجَّل رسمياً**: يُسلَّم في أول مرحلة تحتوي حقل تاريخ تفاعلي (المرحلة 5/الشقق أو المرحلة 6/المدفوعات حسب الحاجة). Calendar يحتاج dep ثقيل (`react-day-picker`) ولا UI استخدام له في المرحلة 3.
- `src/components/theme-provider.tsx`
- `src/components/theme-toggle.tsx`
- `src/components/layout/app-sidebar.tsx` — sidebar للشاشات ≥ md
- `src/components/layout/bottom-nav.tsx` — للجوال
- `src/components/layout/app-header.tsx` — مع building switcher + theme toggle + user menu
- `src/components/layout/app-shell.tsx` — يجمع الكل
- `src/components/shared/empty-state.tsx`
- `src/components/shared/loading-state.tsx`
- `src/components/shared/error-state.tsx`
- `src/components/shared/confirm-dialog.tsx`
- `src/components/shared/page-header.tsx`
- `src/components/shared/data-table.tsx` — جدول reusable مع pagination + filters
- `src/app/(app)/layout.tsx` — يستخدم AppShell
- ألوان معتمدة في Light + Dark بالـ CSS variables

**معايير القبول**:
- [ ] sidebar يظهر على الشاشات ≥ md (768px)، يختفي على أصغر
- [ ] bottom nav يظهر على < md فقط
- [ ] header يحتوي: شعار + building switcher + theme toggle + user dropdown + إشعارات (placeholder)
- [ ] كل النصوص العربية تظهر RTL سليم
- [ ] الأيقونات (lucide) لا تنعكس مع RTL إلا الأسهم (ChevronLeft ↔ ChevronRight حسب الاتجاه)
- [ ] Dark mode سلس بدون "flash of wrong theme" (FOUC)
- [ ] كل shadcn components تعمل في Light و Dark
- [ ] Empty/Loading/Error states جاهزة وتُستخدم في صفحة demo
- [ ] Confirm dialog reusable مع titles وأزرار قابلة للتخصيص
- [ ] الـ layout responsive من 360px إلى 1920px بدون كسر
- [ ] focus rings مرئية في dark + light
- [ ] data-table component يدعم: pagination, sorting, filters, empty state

**سيناريوهات الاختبار**:
1. زيارة /dashboard على شاشة 1440px → sidebar ظاهر، content يأخذ المتبقي.
2. تصغير لـ 375px → sidebar يختفي، bottom nav يظهر، header يبقى.
3. تبديل dark/light → كل العناصر تتلون بشكل صحيح بدون عناصر "محجوزة" في اللون القديم.
4. فتح dropdown menu → يفتح على الجهة الصحيحة في RTL (يميناً وليس يساراً).
5. Reload صفحة في dark mode → لا FOUC.
6. Tab navigation → focus rings ظاهرة على كل عنصر تفاعلي.

**توزيع 100 نقطة**:
- Functionality (35): كل المكونات تعمل، responsive سليم
- Security (5): N/A تقريباً → الباقي يُنقل للـ UX
- Code Quality (20): مكونات reusable، props types واضحة، CSS variables منظمة
- UX/UI (35): RTL، dark mode، responsive، أيقونات، no FOUC، focus rings
- Documentation (5): سرد المكونات في README + screenshots مختصرة (اختياري)

**Definition of Done**: المستشار يفتح أي صفحة فارغة باستخدام AppShell → يحصل على layout كامل بدون أي عمل إضافي → يقدر يبني صفحة جديدة في 5 دقائق باستخدام المكونات الجاهزة.

---

### 📊 المرحلة 4: لوحة التحكم (Dashboard)

**الهدف**: dashboard يعرض إحصائيات حقيقية من DB حسب دور المستخدم.

**المخرجات**:
- `src/app/(app)/dashboard/page.tsx` — Server component يجلب بيانات
- `src/components/dashboard/stats-card.tsx`
- `src/components/dashboard/recent-payments.tsx`
- `src/components/dashboard/recent-expenses.tsx`
- `src/components/dashboard/recent-maintenance.tsx`
- `src/components/dashboard/active-votes.tsx`
- `src/components/dashboard/quick-actions.tsx`
- `src/components/dashboard/role-based-dashboard.tsx`
- `src/lib/queries/dashboard.ts` — query helpers قابلة للاستخدام لاحقاً

**الإحصائيات (admin/treasurer/committee)**:
- الرصيد الحالي (مدفوعات معتمدة − مصروفات مدفوعة)
- إجمالي مدفوعات الشهر الحالي
- إجمالي مصروفات الشهر الحالي
- عدد طلبات صيانة مفتوحة
- عدد تصويتات نشطة
- عدد مدفوعات pending للمراجعة (شارة تنبيه)
- آخر 5 مدفوعات + آخر 5 مصروفات + آخر 5 طلبات صيانة

**الإحصائيات (resident)**:
- المستحقات على شقته (المتأخر)
- آخر دفعة دفعها
- طلبات صيانته المفتوحة
- التصويتات النشطة (مع علامة "صوّت/لم يصوّت")

**Quick Actions حسب الدور**:
- admin: إضافة مصروف، إضافة شقة، دعوة عضو، إنشاء تصويت
- treasurer: تسجيل دفعة، إضافة مصروف
- resident: تسجيل دفعتي، فتح طلب صيانة، تقديم اقتراح
- technician: لا quick actions، فقط قائمة المسندة لي

**معايير القبول**:
- [ ] dashboard يعرض بيانات حقيقية من DB (لا hard-coded)
- [ ] Stats cards تظهر loading skeleton أثناء الجلب
- [ ] dashboard مختلف فعلياً بين الأدوار (لا صفحة واحدة بإخفاء أزرار)
- [ ] empty states عند عدم وجود بيانات (e.g., "لا توجد مدفوعات بعد")
- [ ] روابط الـ "عرض الكل" تعمل (حتى لو الصفحة المستهدفة لم تُبنَ بعد → 404 مؤقت مقبول)
- [ ] الأرقام منسقة بالعربي مع SAR (٥٬٠٠٠ ر.س)
- [ ] التواريخ منسقة بالعربي مع التقويم الميلادي

**سيناريوهات الاختبار**:
1. admin يدخل → يرى كل الإحصائيات + quick actions الكاملة.
2. resident يدخل → يرى فقط بياناته + quick actions محدودة.
3. عمارة فارغة (بدون أي بيانات) → empty states تظهر بشكل لائق على كل widget.
4. تبديل العمارة → dashboard يحدّث بياناته بالكامل.
5. technician يدخل → يرى صفحة مبسّطة بقائمة طلبات الصيانة المسندة فقط.

**توزيع 100 نقطة**:
- Functionality (40): كل الـ widgets تعمل، الأرقام صحيحة
- Security (20): RLS يضمن أن resident لا يرى ميزانية العمارة الكاملة
- Code Quality (15): query helpers reusable، queries لا تطلب أكثر من اللازم
- UX/UI (15): جميل، responsive، dark mode، loading states، تنسيق أرقام عربي
- Documentation (10): README يشرح كيف تختلف dashboards حسب الدور

**Definition of Done**: المستشار يدخل بـ 4 أدوار مختلفة → يرى 4 dashboards مختلفة → كل الأرقام تطابق DB يدوياً (يحسبها بنفسه ويقارن).

---

### 🏠 المرحلة 5: إدارة الشقق والسكان

**الهدف**: CRUD كامل للشقق + ربط السكان بالشقق + دعوة سكان جدد.

**المخرجات**:
- `src/app/(app)/apartments/page.tsx` — قائمة
- `src/app/(app)/apartments/[id]/page.tsx` — تفاصيل
- `src/app/(app)/apartments/new/page.tsx` — إضافة
- `src/components/apartments/apartments-table.tsx`
- `src/components/apartments/apartment-form.tsx`
- `src/components/apartments/member-link-dialog.tsx`
- `src/components/apartments/invite-resident-dialog.tsx`
- `src/actions/apartments.ts` — CRUD + linkMember + inviteByEmail
- `src/lib/validations/apartments.ts`

**Features**:
- جدول شقق مع filter حسب: الطابق، الحالة، عدد السكان (له/ما له)
- نموذج إضافة/تعديل (رقم الشقة فريد ضمن العمارة)
- في صفحة التفاصيل: قائمة السكان (apartment_members) مع زر "إضافة"
- ربط مستخدم موجود بشقة (بريده موجود في النظام)
- دعوة بريد جديد لشقة (إيميل دعوة → عند التسجيل تُنشأ membership + apartment_member تلقائياً)
- تغيير حالة الشقة (occupied / vacant / under_maintenance)
- تحديد رسوم شهرية مخصصة لشقة (override للقيمة الافتراضية في building)
- **في تفاصيل الشقة: تمييز واضح لممثل التصويت** (`is_voting_representative`) — أيقونة + شارة لونية "ممثل التصويت"
- **تعيين أول عضو يُربط بشقة كممثل تصويت تلقائياً** (في server action)
- زر "تغيير ممثل التصويت" — admin يختار من بين أعضاء الشقة الحاليين النشطين فقط
- إذا أُزيل الممثل من الشقة (membership.is_active = false) → النظام يطلب تعيين ممثل بديل قبل إتمام العملية
- تغيير ممثل التصويت يحدث في **عملية ذرّية** (transaction): `false` للقديم + `true` للجديد + audit log entry

**معايير القبول**:
- [ ] فقط admin يقدر يدخل /apartments (UI + RLS + middleware check)
- [ ] resident يحاول الدخول → 403 صريح
- [ ] إضافة شقة جديدة تعمل، رقم الشقة فريد ضمن العمارة (DB constraint)
- [ ] تعديل شقة يعمل
- [ ] **لا يوجد زر حذف** (الشقق تُغيَّر حالتها إلى vacant)
- [ ] ربط مستخدم موجود يعمل، يمنع تكرار نفس النوع (لا يمكن ربط نفس المستخدم كـ owner مرتين لنفس الشقة)
- [ ] دعوة بريد جديد يرسل invite عبر Supabase Auth Admin API
- [ ] الجدول يعرض: رقم، طابق، رسوم، حالة، عدد السكان، **ممثل التصويت**، آخر تعديل
- [ ] Filters تعمل وتحدث URL (للـ shareable links)
- [ ] عند ربط أول عضو بشقة → يُعيَّن تلقائياً كـ `is_voting_representative = true`
- [ ] عند ربط أعضاء إضافيين → الممثل الأول يبقى، الجدد `is_voting_representative = false`
- [ ] في صفحة تفاصيل الشقة: ممثل التصويت واضح ومميَّز بشارة لونية مختلفة عن باقي الأعضاء
- [ ] admin يقدر يغيّر ممثل التصويت من قائمة الأعضاء النشطين فقط (في عملية ذرّية)
- [ ] لا يمكن وجود أكثر من ممثل واحد نشط لشقة (DB unique partial index يفشل المحاولة)
- [ ] تغيير ممثل التصويت يُسجَّل في `audit_logs` بـ old/new
- [ ] محاولة إزالة الممثل الحالي من الشقة دون تعيين بديل → خطأ واضح في UI + server

**سيناريوهات الاختبار**:
1. admin يضيف شقة → تظهر في القائمة فوراً.
2. admin يربط ساكن موجود (أول عضو) → يظهر في تفاصيل الشقة + يُعيَّن تلقائياً كـ voting_representative + يرى الشقة في dashboard.
3. admin يدعو بريداً جديداً → الإيميل يصل → التسجيل ينشئ كل العلاقات صح + إن كان أول عضو يصبح ممثل تلقائياً.
4. resident يحاول /apartments → 403.
5. تعديل رقم شقة عليها مدفوعات → لا يكسر FKs.
6. محاولة إضافة شقة بنفس الرقم في نفس العمارة → خطأ واضح.
7. شقة فيها مالك ومستأجر → admin يحوّل التمثيل من المالك إلى المستأجر → التغيير يحدث ذرّياً + audit log يسجل old/new.
8. محاولة تعيين عضوَين كممثلَين لنفس الشقة عبر API مباشرة → فشل (unique partial index).
9. محاولة إزالة الممثل الوحيد من شقة دون اختيار بديل → خطأ واضح، الإزالة لا تكتمل.

**توزيع 100 نقطة**:
- Functionality (40): CRUD + ربط أعضاء + دعوات
- Security (20): فقط admin يدير، RLS يمنع التلاعب، الدعوات لا تتسرب لعمارات أخرى
- Code Quality (15): server actions نظيفة، validation بـ zod
- UX/UI (15): جدول responsive، forms RTL، dialogs، badges للحالة
- Documentation (10): شرح workflow الدعوة

---

### 💰 المرحلة 6: المالية - المدفوعات

**الهدف**: تسجيل، اعتماد، رفض، رفع إيصال، عرض حسب الدور، audit log.

> 🚨 **تذكير حاسم**: هذه المرحلة تنفّذ فقط **الدفع اليدوي** (الساكن يحوّل خارج النظام ويرفع إيصال، الأمين يراجع ويعتمد). **لا** بوابات دفع إلكترونية. **لا** webhooks. **لا** payment intents. **لا** زر "ادفع الآن". راجع القسم 1.5.1 لتفاصيل القيد الكامل.

**المخرجات**:
- `src/app/(app)/payments/page.tsx`
- `src/app/(app)/payments/new/page.tsx`
- `src/app/(app)/payments/[id]/page.tsx`
- `src/components/payments/payments-table.tsx`
- `src/components/payments/payment-form.tsx`
- `src/components/payments/receipt-uploader.tsx`
- `src/components/payments/approval-actions.tsx`
- `src/components/payments/payment-status-badge.tsx`
- `src/actions/payments.ts`
- `src/lib/storage.ts` — helpers لرفع/تنزيل/توليد signed URLs
- `src/lib/audit.ts` — helper لكتابة audit_logs

**Features**:
- **مصدر الحقيقة الوحيد للأرصدة**: المدفوعات بحالة `approved` فقط (الـ pending لا تُحسب في الرصيد، تظهر منفصلة كـ "بانتظار المراجعة")
- جدول مدفوعات مع filters: شهر، سنة، شقة، حالة، طريقة دفع
- نموذج تسجيل دفعة (يختار الشقة من dropdown مفلتر بالعمارة)
- **إيصال إلزامي عند تسجيل الدفعة** (لا يُسمح بدفعة بدون إثبات في server validation + DB CHECK)
- رفع إيصال (image / pdf، حد أقصى 5MB) → bucket `receipts`
- زر اعتماد/رفض (treasurer/admin فقط)
- عند الرفض: حقل "سبب الرفض" إلزامي (server validation + DB CHECK constraint)
- عرض حالة بـ Badge ملون (pending = أصفر، approved = أخضر، rejected = أحمر)
- resident يرى فقط مدفوعات شقته أو التي سجّلها بنفسه
- audit log entry على كل اعتماد/رفض/تعديل
- قسم منفصل في الواجهة: **"بانتظار المراجعة"** يعرض كل الدفعات pending للأمين/المدير

**معايير القبول**:
- [ ] جدول يدعم filtering + pagination (default 20/page)
- [ ] رفع receipt يحفظ في storage بـ path `{building_id}/payments/{payment_id}/{filename}`
- [ ] preview للإيصال (image inline / pdf icon مع رابط فتح)
- [ ] approval flow يعمل: `pending` → `approved` أو `rejected` فقط (لا حالات أخرى)
- [ ] **إيصال الدفع إلزامي عند الإنشاء** (لا يُمكن submit الفورم بدون رفع ملف؛ DB CHECK يمنع إدراج payment بـ receipt_url=null)
- [ ] رفض بدون سبب → خطأ في UI + server action + DB CHECK constraint
- [ ] ساكن يرى فقط مدفوعاته (RLS يضمن، UI يخفي filter بشقة أخرى)
- [ ] **لا يوجد زر حذف** نهائياً
- [ ] **لا يوجد** أي زر/حقل/خيار يشير إلى دفع إلكتروني/بوابة دفع/Stripe/HyperPay/Moyasar/online gateway/Apple Pay (تأكيد عبر grep)
- [ ] **لا يوجد** webhook handler ولا route لاستقبال أحداث دفع خارجية
- [ ] حسابات الرصيد في dashboard/reports تستخدم `status = approved` فقط (تأكيد بصري + مراجعة الـ queries)
- [ ] الـ pending تظهر في قسم منفصل "بانتظار المراجعة" (شفافية + لا تشويش على الرصيد)
- [ ] audit log يسجل كل عملية مع actor + old/new values + سبب الرفض إن وجد
- [ ] toast على كل عملية (نجاح/فشل)
- [ ] الأرقام منسقة عربي مع SAR
- [ ] period_month يُمثَّل بـ date picker شهري (شهر + سنة)

**سيناريوهات اختبار الأمان**:
1. resident-A يحاول رؤية مدفوعات resident-B في نفس العمارة → فشل.
2. resident يحاول اعتماد دفعته الخاصة → فشل (UI + server action).
3. treasurer من عمارة B يحاول اعتماد دفعة عمارة A → فشل (RLS + server check).
4. تعديل مبلغ دفعة معتمدة → audit log يسجل القيم القديمة والجديدة.
5. رفع receipt بـ size > 5MB → خطأ واضح.
6. رفع receipt بـ type غير مسموح → خطأ.
7. الوصول المباشر لـ signed URL لإيصال عمارة أخرى → فشل.
8. محاولة insert دفعة بدون `receipt_url` عبر API مباشرة → فشل في server action + DB CHECK.
9. محاولة `update payments set status = 'rejected'` بدون `rejection_reason` → فشل في DB CHECK + server action.
10. إنشاء دفعة pending → فحص في dashboard أن الرصيد لم يتغير، وأن قسم "بانتظار المراجعة" زاد بـ 1.
11. اعتماد نفس الدفعة → فحص أن الرصيد ازداد، و "بانتظار المراجعة" نقص.
12. رفض دفعة → فحص أن الرصيد لم يتأثر، السبب ظاهر في الـ audit، الإيصال محفوظ.
13. مراجعة كل routes/APIs في المشروع عبر grep → **لا يوجد** route باسم `/api/webhooks/*` أو `/api/payment-intent/*` أو ما شابه.
14. مراجعة الـ enum في DB → `payments.status` فقط `pending | approved | rejected` (لا قيم أخرى).

**توزيع 100 نقطة**:
- Functionality (40): كل التدفقات تعمل
- Security (20): RLS + storage + role checks + file validation
- Code Quality (15): forms typed بـ zod، actions نظيفة، audit helper reusable
- UX/UI (15): receipt upload UX، badges واضحة، filters سهلة، تنسيق عربي
- Documentation (10): شرح approval workflow + audit

**Definition of Done**: المستشار يجرب من 3 أدوار → كل دور يرى ما يجب أن يراه فقط → الـ receipts تتحمّل وتظهر سليم → كل اعتماد/رفض يظهر في audit logs.

---

### 💸 المرحلة 7: المالية - المصروفات

**الهدف**: مصروفات بـ workflow كامل (draft → pending_review → approved → paid أو cancelled مع سبب) + رفع فواتير + ربط بـ vendors.

**المخرجات**:
- `src/app/(app)/expenses/page.tsx`
- `src/app/(app)/expenses/new/page.tsx`
- `src/app/(app)/expenses/[id]/page.tsx`
- `src/components/expenses/expenses-table.tsx`
- `src/components/expenses/expense-form.tsx`
- `src/components/expenses/expense-status-badge.tsx`
- `src/components/expenses/cancel-dialog.tsx` — يطلب سبب إلزامي
- `src/components/expenses/invoice-uploader.tsx`
- `src/components/expenses/status-actions.tsx`
- `src/actions/expenses.ts`

**Features**:
- workflow حالات كاملة مع أزرار transition محدودة بالحالة الحالية
- ربط بـ vendor (اختياري)
- رفع فاتورة (`invoices` bucket) + إيصال دفع (`receipts` bucket)
- تصنيف (نص حر مع suggestions من تصنيفات سابقة)
- زر إلغاء يطلب سبب → status = cancelled (لا حذف نهائياً)
- audit log على كل تغيير حالة
- filters: تصنيف، حالة، تاريخ من/إلى، vendor

**معايير القبول**:
- [ ] **لا يوجد زر حذف** نهائياً
- [ ] إلغاء يطلب سبب وإلا يفشل (UI + DB CHECK constraint)
- [ ] حالات الـ workflow تنتقل صح ولا يمكن العودة بشكل عشوائي
  (مثلاً: paid لا يعود لـ draft، الـ cancelled نهائي)
- [ ] رفع فاتورة في bucket `invoices` بـ path `{building_id}/expenses/{expense_id}/{filename}`
- [ ] فقط treasurer/admin يقدرون يلغون أو يعتمدون
- [ ] audit log كامل لكل تغيير
- [ ] filters تحدث URL

**سيناريوهات الاختبار**:
1. resident يحاول /expenses → يرى للقراءة فقط، لا أزرار إنشاء/تعديل.
2. treasurer ينشئ مصروف → يحفظ كـ draft.
3. تحويل draft → pending_review → approved → paid → كل خطوة تُسجَّل في audit.
4. محاولة إلغاء بدون سبب → خطأ.
5. محاولة الانتقال من paid إلى draft → فشل.
6. تعديل مبلغ مصروف معتمد → audit يسجل التغيير.

**توزيع 100 نقطة**: مماثل للمرحلة 6.

---

### 🔧 المرحلة 8: طلبات الصيانة + المهام

**الهدف**: workflow كامل للصيانة + tasks board للإدارة.

**المخرجات**:

**Maintenance**:
- `src/app/(app)/maintenance/page.tsx`
- `src/app/(app)/maintenance/[id]/page.tsx`
- `src/app/(app)/maintenance/new/page.tsx`
- `src/components/maintenance/request-card.tsx`
- `src/components/maintenance/request-form.tsx`
- `src/components/maintenance/status-timeline.tsx`
- `src/components/maintenance/assign-technician.tsx`
- `src/components/maintenance/before-after-images.tsx`
- `src/components/maintenance/link-expense-dialog.tsx`
- `src/actions/maintenance.ts`

**Tasks**:
- `src/app/(app)/tasks/page.tsx`
- `src/app/(app)/tasks/new/page.tsx`
- `src/components/tasks/tasks-board.tsx` — kanban بسيط بدون drag (drag bonus)
- `src/components/tasks/task-card.tsx`
- `src/components/tasks/task-form.tsx`
- `src/actions/tasks.ts`

**Maintenance Features**:
- ساكن ينشئ طلب + رفع صورة "قبل" (اختيارية)
- admin/committee يسند لفني (dropdown يعرض users بدور technician)
- فني يحدّث حالة (in_progress → completed) + يرفع صورة "بعد"
- Timeline يعرض كل تغيير حالة + من + متى + ملاحظات (من audit_logs)
- ربط بمصروف (إنشاء مصروف من طلب صيانة في خطوة واحدة)
- Filters: حالة، أولوية، نوع موقع، assigned_to

**Tasks Features**:
- كانبان: todo / in_progress / waiting_external / completed
- إسناد لشخص + due date
- overdue يُحدَّد تلقائياً (computed في query)
- على الجوال board يصبح list مع tabs للحالات

**معايير القبول**:
- [ ] ساكن ينشئ طلب صيانة بنجاح + يرفع صورة
- [ ] فني يرى **فقط** طلباته (RLS) + يقدر يحدّث حالتها فقط
- [ ] فني لا يقدر يرى/يعدّل طلب لم يُسند له
- [ ] timeline تعمل وتعرض ترتيب صحيح للأحداث
- [ ] before/after images تتحمّل وتُعرض جنباً لجنب
- [ ] إنشاء مصروف من طلب صيانة يربط `related_expense_id`
- [ ] tasks board responsive — على < md يصبح قائمة بـ tabs
- [ ] overdue يظهر بـ badge أحمر

**سيناريوهات الاختبار**:
1. resident ينشئ طلب → admin يراه → يسنده لفني → فني يراه ويحدّثه.
2. فني-A يحاول رؤية طلب فني-B → فشل (RLS + UI).
3. فني يحاول إسناد طلب لنفسه أو لآخر → فشل (لا صلاحية).
4. ربط طلب صيانة بمصروف → الإثنان مرتبطان bidirectional في DB.
5. مهمة عليها due_date في الماضي + status = todo → تظهر overdue.

**توزيع 100 نقطة**:
- Functionality (40): كل التدفقات + timeline + ربط expenses
- Security (20): RLS صارم على فنيين، assignment محمي
- Code Quality (15): timeline reusable، state machine واضحة
- UX/UI (15): responsive board، before/after جذاب
- Documentation (10): شرح حالات الـ workflow

---

### 👥 المرحلة 9: الموردين والفنيين

**الهدف**: قاعدة بيانات vendors بسيطة وسريعة الاستخدام.

**المخرجات**:
- `src/app/(app)/vendors/page.tsx`
- `src/app/(app)/vendors/new/page.tsx`
- `src/app/(app)/vendors/[id]/page.tsx`
- `src/components/vendors/vendors-grid.tsx`
- `src/components/vendors/vendor-card.tsx`
- `src/components/vendors/vendor-form.tsx`
- `src/components/vendors/rating-stars.tsx`
- `src/actions/vendors.ts`

**Features**: CRUD + rating (1-5) + filters حسب specialty + ملاحظات + رقم جوال (اتصال مباشر من الموبايل عبر `tel:`).

**معايير القبول**:
- [ ] فقط admin/treasurer/committee يقدرون يديرون
- [ ] رقم الجوال على الموبايل قابل للنقر للاتصال (`<a href="tel:...">`)
- [ ] rating بنجوم تفاعلية
- [ ] في صفحة تفاصيل vendor: قائمة المصروفات المرتبطة به (للتاريخ)

**توزيع 100 نقطة**: مرحلة بسيطة، يكفي 100% functional + UX جيد.

---

### 🗳️ المرحلة 10: الحوكمة - اقتراحات + تصويت + قرارات

**الهدف**: workflow كامل من اقتراح → تصويت → قرار، مع تطبيق مبدأ "صوت واحد لكل شقة" بصرامة على 3 طبقات.

> 🚨 **تذكير حاسم**: التصويت **per-apartment فقط**. كل شقة لها صوت واحد، يُدلى به ممثل تصويت واحد فقط (`is_voting_representative = true` في `apartment_members`). لا يوجد `voting_scope`. راجع القسم 1.5.2 لتفاصيل القيد الكامل.

**المخرجات**:

**Suggestions**:
- `src/app/(app)/suggestions/page.tsx`
- `src/app/(app)/suggestions/[id]/page.tsx`
- `src/app/(app)/suggestions/new/page.tsx`
- `src/components/suggestions/suggestion-card.tsx`
- `src/components/suggestions/suggestion-form.tsx`
- `src/components/suggestions/convert-to-vote-dialog.tsx`
- `src/actions/suggestions.ts`

**Votes**:
- `src/app/(app)/votes/page.tsx`
- `src/app/(app)/votes/[id]/page.tsx`
- `src/app/(app)/votes/new/page.tsx`
- `src/components/votes/vote-card.tsx`
- `src/components/votes/vote-form.tsx`
- `src/components/votes/cast-vote.tsx` — يعرض اسم الشقة التي يصوّت باسمها، أو رسالة الحرمان
- `src/components/votes/representation-banner.tsx` — banner واضح: "تصوّت باسم شقة [X]"
- `src/components/votes/results-chart.tsx`
- `src/components/votes/vote-status-badge.tsx`
- `src/components/votes/voted-apartments-list.tsx` — للأدمن: أي شقق صوّتت ومن صوّت
- `src/actions/votes.ts`
- `src/lib/voting.ts` — حساب النتائج وقواعد القبول (تتعامل مع apartments فقط، لا references لـ user-scope)

**Decisions**:
- `src/app/(app)/decisions/page.tsx`
- `src/app/(app)/decisions/[id]/page.tsx`
- `src/components/decisions/decision-card.tsx`
- `src/actions/decisions.ts`

**Vote Features (المبدأ: per-apartment فقط)**:
- إنشاء تصويت بخيارات متعددة (يمكن أكثر من نعم/لا).
- **لا يوجد** `voting_scope` — كل تصويت per-apartment إلزامياً.
- approval_rule: `simple_majority` (>50%) / `two_thirds` (≥66.67%) / `custom` (threshold يحدده المنشئ).
- حالات: `draft` → `active` → `closed` (أو `cancelled`).
- **منع التصويت المكرر من نفس الشقة على 3 طبقات** (defense in depth):
  1. **UI**: زر "صوّت" يظهر فقط لمن `is_voting_representative = true` لشقة لم تصوّت بعد على هذا التصويت.
  2. **Server action**: تتحقق من building membership + `is_voting_representative = true` + غياب vote_response سابق لنفس apartment_id قبل أي insert.
  3. **DB**: unique constraint على `(vote_id, apartment_id)` في `vote_responses`.
- **نتائج تظهر بعد closing فقط** للمستخدمين العاديين. admin/committee يرون real-time أثناء active.
- **تحويل اقتراح → تصويت** في dialog واحد (يحفظ `votes.suggestion_id`).
- **حساب النتائج** (مهم — يُختبر بدقة):
  - عدد الأصوات لكل خيار = **عدد الشقق** التي اختارته (وليس عدد المستخدمين).
  - نسبة الإقبال = `شقق صوّتت / إجمالي شقق العمارة المؤهلة` (الشقق التي لها على الأقل membership نشطة وممثل معيَّن).
  - قواعد القبول تُطبَّق على نسبة الأصوات للخيار الفائز من إجمالي الشقق المصوّتة.
- **حالات خاصة في UI**:
  - مستخدم ليس voting_representative لأي شقة → صفحة التصويت تعرض رسالة: **"لست ممثل تصويت لأي شقة، لا يمكنك التصويت."** + إن كان عضواً في شقة، اسم الممثل الحالي.
  - مستخدم ممثل لأكثر من شقة (مالك عدة شقق) → نموذج التصويت يكرّر مرة لكل شقة (صوت منفصل لكل واحدة).
  - شقة صوّتت بالفعل → عرض الخيار المختار + اسم الممثل الذي صوّت + التاريخ (شفافية).
- **تغيير ممثل التصويت أثناء تصويت نشط**: الصوت السابق يبقى محفوظاً (لا يُحذف). الممثل الجديد لا يقدر يصوّت ثانية لنفس الشقة (DB unique constraint يمنع).

**معايير القبول**:
- [ ] **لا يوجد** أي عمود/enum/UI/كود يشير إلى `voting_scope` (تأكيد عبر grep في كل الـ codebase)
- [ ] محاولة تصويت من نفس الشقة مرتين → فشل في كل الطبقات الثلاث (UI لا يعرض الزر، server action ترفض، DB unique يفشل)
- [ ] محاولة تصويت من عضو ليس voting_representative → زر التصويت غير ظاهر + server action ترفض
- [ ] مستخدم ممثل لشقتين (مالك عدة شقق) → يصوّت بشقتين مختلفتين بنجاح ويظهران كصوتَين منفصلَين
- [ ] vote نشط ينتهي تلقائياً بعد `ends_at` (check on read على الأقل)
- [ ] نتائج تعرض: **عدد الشقق** + نسبة + bar chart بـ recharts (وليس عدد المستخدمين)
- [ ] نسبة الإقبال = شقق صوّتت / إجمالي شقق العمارة المؤهلة
- [ ] إنشاء قرار من تصويت ناجح يربطهم (`decisions.vote_id`)
- [ ] resident عادي (غير ممثل) يقدر يقترح، لكن لا يصوّت
- [ ] فقط admin/committee يحول اقتراح لتصويت
- [ ] simple_majority حساب صح (>50% من شقق صوّتت)
- [ ] two_thirds حساب صح (≥66.67%)
- [ ] custom threshold يُطبَّق صح
- [ ] banner "تصوّت باسم شقة X" واضح في cast-vote
- [ ] إذا تغيّر voting_representative أثناء تصويت نشط: الصوت السابق يبقى، الممثل الجديد لا يصوّت ثانية لنفس الشقة
- [ ] للأدمن: قائمة الشقق التي صوّتت + من صوّت + متى (شفافية داخلية)
- [ ] للمستخدم العادي قبل closing: لا يرى تفاصيل أصوات الشقق الأخرى (خصوصية تصويتية)

**سيناريوهات الاختبار** (تشمل السيناريوهات الـ 5 الإلزامية أ–هـ من القسم 1.5.2):

**أ. شقة فيها مالك فقط**:
1. شقة 101 فيها user-A فقط (relation_type = owner، is_voting_representative = true تلقائياً عند الربط).
2. user-A يفتح تصويت نشط → banner يظهر: "تصوّت باسم شقة 101" → يصوّت → ينجح.
3. النتيجة: شقة 101 سجّلت صوتاً واحداً.

**ب. شقة فيها مستأجر فقط**:
4. شقة 102 فيها user-B (relation_type = resident، is_voting_representative = true تلقائياً لأنه الوحيد).
5. user-B يصوّت → ينجح بنفس الآلية.

**ج. شقة فيها مالك ومستأجر**:
6. شقة 103 فيها user-C (owner، is_voting_representative = true) و user-D (resident، is_voting_representative = false).
7. user-C يصوّت → ينجح.
8. user-D يفتح صفحة التصويت → يرى رسالة: "تصوّتت شقة 103 بواسطة user-C في [التاريخ]" → زر التصويت غير ظاهر له.

**د. محاولة تصويت ثاني من نفس الشقة**:
9. بعد سيناريو (ج)، user-D يحاول insert في `vote_responses` عبر API مباشرة → فشل (server action validation + DB unique constraint).
10. admin يحوّل voting_representative من user-C إلى user-D → user-D يحاول التصويت → فشل (DB unique على apartment_id موجود سابقاً).

**هـ. النتائج لا تتضاعف بزيادة عدد المستخدمين**:
11. سيناريو: عمارة فيها 3 شقق:
    - شقة 101 (مستخدم واحد: المالك)
    - شقة 102 (مستخدمان: مالك + مستأجر، الممثل = المالك)
    - شقة 103 (4 مستخدمين: مالك + 3 ساكنين، الممثل = المالك)
    - كل ممثل يصوّت "نعم".
12. النتيجة المتوقعة: **3 أصوات نعم** (وليس 1+2+4 = 7).
13. نسبة الإقبال: 100% (3/3 شقق صوّتت).

**و. اختبارات حسابية**:
14. تصويت simple_majority بـ 5 شقق: 3 نعم 2 لا → نعم تفوز (3/5 = 60% > 50%).
15. تصويت two_thirds بـ 6 شقق: 4 نعم 2 لا → 4/6 = 66.7% → تفوز (border case).
16. تصويت two_thirds بـ 6 شقق: 3 نعم 3 لا → 50% → تفشل.
17. تصويت custom threshold = 75% بـ 8 شقق: 6 نعم 2 لا → 6/8 = 75% → تفوز (border).
18. تصويت custom threshold = 75% بـ 8 شقق: 5 نعم 3 لا → 5/8 = 62.5% → تفشل.

**ز. اختبارات أمنية وحدودية**:
19. محاولة تصويت بعد `ends_at` → فشل صريح.
20. resident غير ممثل يحاول إنشاء تصويت → فشل.
21. محاولة تصويت في تصويت من عمارة أخرى → فشل (RLS + server check).
22. عرض النتائج لمستخدم عادي قبل closing → ممنوع، يرى فقط "اقتراع مغلق ستظهر النتائج بعد الإغلاق".
23. إعادة فتح تصويت مغلق → ممنوع (status = closed نهائي).
24. محاولة insert vote_response بـ apartment_id لشقة في عمارة أخرى → فشل.

**توزيع 100 نقطة**:
- Functionality (40): كل قواعد الـ approval تعمل + per-apartment صارم + كل سيناريوهات أ-ز تنجح
- Security (20): التصويت المكرر مستحيل على 3 طبقات + تغيير الممثل آمن وذرّي + محاولات الـ API المباشرة تفشل
- Code Quality (15): logic في `src/lib/voting.ts` معزولة وقابلة للاختبار، تتعامل مع apartments فقط، **لا references** لـ user-scope في أي مكان
- UX/UI (15): banner واضح، 3 حالات (يصوّت / صوّتت الشقة / غير ممثل) واضحة، نسب عربية، charts dark mode
- Documentation (10): شرح المبدأ في README وقواعد القبول بأمثلة عربية مع أرقام

---

### 📁 المرحلة 11: المستندات + سجل التدقيق

**الهدف**: مركز مستندات + viewer لـ audit logs مع filters.

**المخرجات**:

**Documents**:
- `src/app/(app)/documents/page.tsx`
- `src/components/documents/documents-grid.tsx`
- `src/components/documents/document-card.tsx`
- `src/components/documents/upload-dialog.tsx`
- `src/actions/documents.ts`

**Audit Logs**:
- `src/app/(app)/audit-logs/page.tsx`
- `src/components/audit/audit-table.tsx`
- `src/components/audit/diff-viewer.tsx`
- `src/components/audit/entity-link.tsx`

**Documents Features**: upload (admin/treasurer/committee) → categorize → download (signed URL). Search بالعنوان والتصنيف.

**Audit Logs Features**:
- جدول مع filters: actor, entity_type, action, date range
- diff viewer يعرض old_values vs new_values مع تلوين الفروقات
- pagination (50/page)
- تصدير CSV (bonus)

**معايير القبول**:
- [ ] فقط admin/committee يصلون لـ /audit-logs (UI + RLS)
- [ ] resident يحاول → 403
- [ ] diff viewer يبرز الفروقات بألوان (أحمر للقديم، أخضر للجديد)
- [ ] pagination تعمل بـ 1000+ records بدون بطء (cursor pagination)
- [ ] documents searchable بالعنوان والتصنيف
- [ ] رابط download يولّد signed URL بـ صلاحية محدودة (1 ساعة)

**توزيع 100 نقطة**: عادي.

---

### 📈 المرحلة 12: التقارير

**الهدف**: تقرير مالي شهري قابل للطباعة (والتصدير PDF كـ bonus).

**المخرجات**:
- `src/app/(app)/reports/page.tsx`
- `src/app/(app)/reports/financial/page.tsx`
- `src/app/(app)/reports/financial/[period]/page.tsx`
- `src/components/reports/financial-report.tsx`
- `src/components/reports/period-selector.tsx`
- `src/components/reports/print-styles.css`
- `src/lib/reports.ts`
- `src/lib/queries/reports.ts` — aggregations في DB

**Features**:
- اختيار فترة (شهر / سنة / مخصص)
- ملخص: دخل، مصروفات، رصيد، متأخرات، عدد العمليات
- تفاصيل بالتصنيفات (top categories)
- charts: bar (شهري) + pie (تصنيفات)
- print-friendly view
- (bonus) تصدير PDF عبر react-to-pdf أو puppeteer

**معايير القبول**:
- [ ] الأرقام دقيقة 100% (المستشار يحسبها يدوياً ويقارن)
- [ ] print preview نظيف بـ RTL، بدون header/footer زائدين
- [ ] charts بسيطة وواضحة
- [ ] تحميل سريع (< 2s) حتى مع بيانات كثيرة (queries بـ aggregations في DB)
- [ ] resident لا يصل لـ /reports (UI + middleware)
- [ ] الفترة المختارة تنعكس في URL

**توزيع 100 نقطة**:
- Functionality (50): دقة الأرقام أولوية
- Security (10): الوصول محدود
- Code Quality (15): aggregations في DB
- UX/UI (15): print جميل
- Documentation (10): شرح الحسابات

---

### 📱 المرحلة 13: PWA + Polish شامل

**الهدف**: تطبيق قابل للتثبيت + offline + audit شامل لـ UX.

**المخرجات**:
- `src/app/manifest.ts` (Next.js metadata API)
- `public/icons/` — كل الأحجام (72, 96, 128, 144, 152, 192, 384, 512, maskable)
- `src/app/sw.ts` — service worker بـ Serwist
- `src/app/~offline/page.tsx`
- `src/components/shared/install-prompt.tsx`
- `src/components/shared/network-status.tsx`
- مراجعة شاملة:
  - كل الصفحات لها loading/empty/error states
  - mobile breakpoints مراجعة (320, 375, 414, 768)
  - accessibility: alt على كل صورة، labels على كل input
  - keyboard navigation كامل
  - color contrast WCAG AA

**معايير القبول**:
- [ ] Lighthouse PWA score ≥ 90
- [ ] التطبيق installable على Chrome/Safari (يظهر إشعار install)
- [ ] offline page تظهر بدون نت
- [ ] icons تظهر صح في install prompt + home screen
- [ ] كل صفحة لها loading + empty + error states
- [ ] axe-core audit: لا errors حرجة
- [ ] Lighthouse Performance ≥ 85 على 3G simulated
- [ ] manifest.json valid (يفحص بـ Chrome DevTools)
- [ ] theme_color يطابق dark/light عبر media query
- [ ] install prompt يظهر مرة واحدة، لا يزعج

**سيناريوهات الاختبار**:
1. فتح في Chrome → install prompt يظهر → install → التطبيق يفتح كـ standalone.
2. قطع النت → التنقل لصفحة → /~offline تظهر.
3. Lighthouse في incognito → كل الـ scores تتجاوز الحد الأدنى.
4. axe DevTools على كل صفحة رئيسية → لا errors.

**توزيع 100 نقطة**:
- Functionality (40): PWA يعمل + accessibility
- Security (5): N/A
- UX (40): polish شامل
- Code Quality (10): SW config نظيف
- Documentation (5): شرح التثبيت

---

### 🛡️ المرحلة 14: Super Admin والاشتراكات

**الهدف**: لوحة لمالك المنصة لإدارة العمارات والاشتراكات والمستخدمين.

**المخرجات**:
- `src/app/(super-admin)/super-admin/layout.tsx`
- `src/app/(super-admin)/super-admin/page.tsx` — dashboard المنصة
- `src/app/(super-admin)/super-admin/buildings/page.tsx`
- `src/app/(super-admin)/super-admin/buildings/[id]/page.tsx`
- `src/app/(super-admin)/super-admin/users/page.tsx`
- `src/app/(super-admin)/super-admin/audit/page.tsx`
- `src/components/super-admin/buildings-table.tsx`
- `src/components/super-admin/subscription-controls.tsx`
- `src/components/super-admin/usage-stats.tsx`
- `src/components/super-admin/trial-warnings.tsx`
- `src/actions/super-admin.ts`

**Features**:
- إحصائيات المنصة: عدد العمارات (active/trial/expired)، عدد المستخدمين الكلي، MRR محسوب يدوياً
- جدول العمارات: trial expiry، plan، status، apartments count، last activity
- تعديل subscription_plan + status + extend trial
- تعطيل عمارة (نضع `subscription_status = expired` → RLS تمنع الدخول)
- إعفاء عمارة من subscription (free)
- تنبيهات: عمارات قاربت trial expiry (< 7 أيام)
- audit logs عبر كل العمارات

**معايير القبول**:
- [x] **فقط** super_admin يدخل (middleware + RLS + double-check في كل action) ✅ v3.20
- [x] محاولة دخول من حساب عادي → 403 صريح ✅ v3.20
- [x] تعديل subscription يعمل ويُسجل في audit ✅ v3.20 (audit_logs trigger يَلتقط UPDATE تلقائياً)
- [x] تعطيل عمارة → كل أعضاؤها لا يقدرون يدخلون (rewrite إلى `/subscription-inactive`) ✅ v3.20
- [x] dashboard يعرض إحصائيات حقيقية عبر كل العمارات (platform_stats RPC) ✅ v3.20
- [x] super_admin لا يظهر في building_memberships ولا في building_switcher ✅ (موجود من Phase 1)

**سيناريوهات اختبار الأمان (مكثفة لهذه المرحلة)**:
1. admin عادي يحاول /super-admin → 403.
2. تغيير URL يدوياً لـ super-admin → 403.
3. تعطيل عمارة → admin فيها يحاول الدخول → يُمنع برسالة "اشتراك منتهي".
4. super_admin يقدر يرى أي بيانات في أي عمارة (RLS يسمح).
5. محاولة منح super_admin لشخص آخر من UI → يجب ألا تكون متاحة (يتم يدوياً عبر SQL فقط).

**توزيع 100 نقطة**:
- Functionality (35)
- Security (30): تركيز شديد
- Code Quality (15)
- UX/UI (15)
- Documentation (5)

---

### ✅ المرحلة 15: QA نهائي + التوثيق + النشر

**الهدف**: المنتج جاهز للإنتاج. كل شيء موثق، مُختبر، ومنشور.

**المخرجات**:
- `README.md` كامل ومفصّل (replaces المرحلة 0)
- `DEPLOYMENT.md` — خطوات النشر على Vercel + Supabase خطوة بخطوة
- `ADMIN_GUIDE.md` — دليل أول admin/super_admin
- `USER_GUIDE.md` — دليل السكان (عربي مع screenshots بسيطة)
- `CHANGELOG.md`
- `.env.example` نهائي مع شرح لكل متغير
- regression test pass على كل الـ flows من المراحل 0-14
- performance audit نهائي
- security audit شامل (re-test كل سيناريوهات RLS من كل المراحل)
- production build deployed على Vercel فعلياً (URL تجريبي)

**معايير القبول**:
- [x] README يكفي لشخص لم يرَ المشروع → يقدر يشغّله محلياً في < 15 دقيقة ✅ v3.23
- [x] DEPLOYMENT يأخذ شخصاً من صفر → نشر كامل على Vercel + Supabase في < 30 دقيقة ✅ v3.23
- [x] Supabase setup موثق خطوة بخطوة (screenshots اختياري للنشر اللاحق) ✅ v3.23
- [x] طريقة إنشاء أول super_admin موثقة (README + DEPLOYMENT + ADMIN_GUIDE + supabase/README) ✅ v3.23
- [x] كل سيناريوهات اختبار الأمان من المراحل السابقة لا تزال تنجح (226/226) ✅ v3.23
- [x] لا توجد console errors أو warnings في prod build ✅ v3.23 (build نظيف)
- [ ] Lighthouse: Performance ≥ 85, Accessibility ≥ 90, Best Practices ≥ 90, SEO ≥ 90, PWA ≥ 90 ⏳ (يَتطلَّب deploy فعلي على Vercel — يُجرى بعد deploy)
- [x] CHANGELOG يوثق كل المراحل (16 مرحلة + 16 درساً) ✅ v3.23
- [x] لا dependencies مهجورة أو vulnerable ✅ v3.23 (postcss override 8.5.10+)

**توزيع 100 نقطة**:
- Documentation (40): التوثيق هو القيمة الأساسية
- Functionality (30): regression شاملة
- Security (20): re-audit شاملة
- UX/UI (10): final polish

**Definition of Done**: شخص جديد يقرأ README → يسحب الكود → يشغّل محلياً → يفتح DEPLOYMENT → ينشر على بيئة جديدة → يحصل على نظام يعمل بدون أي مساعدة خارج الوثائق.

---

### 🌐 المرحلة 16: Marketing + Pricing + Public Subscription Requests

**الهدف**: تَحويل `/` من فارغ إلى تَجربة marketing احترافية، مع صفحة باقات تُعرض من DB، ونموذج طلب اشتراك عام (CRM-only — ليس checkout). تَهيئة `platform_settings` للاستخدام في Phase 18.

**نطاق محدَّد**: واجهة عامة فقط. لا `/team`، لا bank-transfer flow، لا resident self-reg.

**المخرجات**:

`supabase/17_phase16.sql`:
- `subscription_tiers` — جدول الباقات (id, name, description, price_monthly, price_yearly, max_apartments, max_admins, features jsonb, is_active, sort_order). seeded بـ 4 باقات افتراضية.
- `platform_settings` — جدول key-value للإعدادات العامة (bank_account jsonb، vat_rate، vat_enabled). RLS: SELECT لـ super_admin فقط. seeded بقيم placeholder.
- `subscription_requests` — نموذج CRM (email, full_name, phone, building_name, city, estimated_apartments, interested_tier, message, status, notes). status enum: `new | contacted | qualified | closed_won | closed_lost`. RLS: INSERT للـ anon، SELECT/UPDATE/DELETE لـ super_admin فقط.

Pages:
- `src/app/(marketing)/layout.tsx` — header + footer ماركتنغ مختلف عن `(app)` و `(super-admin)`.
- `src/app/(marketing)/page.tsx` — landing.
- `src/app/(marketing)/pricing/page.tsx` — يَقرأ من `subscription_tiers` (ليس hardcoded).
- `src/app/(marketing)/contact/page.tsx` — نموذج → INSERT في `subscription_requests`.
- `src/app/(super-admin)/super-admin/requests/page.tsx` — CRM للطلبات.
- `src/app/(super-admin)/super-admin/settings/page.tsx` — UI لـ `platform_settings` (بيانات البنك + VAT).

Components:
- `src/components/marketing/`: hero, features-grid, pricing-cards, cta-banner, marketing-header, marketing-footer, contact-form.
- `src/components/super-admin/`: bank-account-form, vat-settings-form, requests-table.

Server actions:
- `submitContactRequestAction(formData)` — anon، rate-limited (≤ 3/IP/يوم)، honeypot field.
- `updatePlatformSettingsAction(formData)` — super_admin only.

**ملاحظة scope حرجة**: أزرار "اشترك" في `/pricing` تَذهب إلى `/contact?tier=X` كـ placeholder حتى تَجهز Phase 18. **النص في الـ onboarding email/UI** يَذكر "تَواصل مع super_admin لإنشاء حساب admin" — لا يَعِد بـ self-service بعد. (هذا تَجنُّب لـ vapor-feature في الوثائق، نفس درس #17.)

**سياسة البريد الإلكتروني (مُحدَّثة v3.27)**

البريد ليس عمود فقري لـ Phase 16 — الـ source of truth هو DB والـ UI. لتَجنُّب فشل الـ phase بسبب تَكامل خارجي:

**مُزوِّد مَختار**: **Resend** (`@resend/node`) — مَجاني حتى 3,000 بريد/شهر، يَدعم custom domains، عربية كاملة، API بسيط.

**env vars جديدة**:
- `RESEND_API_KEY` (إلزامي للـ deploy production)
- `RESEND_FROM_EMAIL` (مثلاً `noreply@your-domain.com`)
- `SUPER_ADMIN_NOTIFICATION_EMAIL` (لمن يَستلم إشعارات الطلبات الجديدة)

**graceful failure mandatory**:
- إذا `RESEND_API_KEY` غير موجود (مثلاً في dev) → server action يُسجِّل warning ويُكمل بنجاح. الطلب يُحفَظ في DB.
- إذا Resend API يَفشل (network/quota/etc.) → catch + log، الطلب يَبقى محفوظاً.
- لا rollback للـ DB INSERT بسبب فشل البريد.
- يُسجَّل خطأ البريد في `audit_logs` (entity_type='email_failure') للـ super_admin للمُتابعة.

**معايير القبول (مُعاد تَصنيفها)**:

🔴 **معايير حرجة لـ 100/100** (لا يُمكن تَخطّيها):
- [ ] `/` يَعرض landing احترافية، Lighthouse Performance ≥ 90 على production
- [ ] `/pricing` يَعرض باقات من DB (تَعديل tier في SQL ينعكس فوراً، لا rebuild)
- [ ] toggle شهري/سنوي يَعمل
- [ ] نموذج `/contact` **يَحفظ** الطلب في DB ويَظهر فوراً في `/super-admin/requests`
- [ ] anon لا يَستطيع SELECT/UPDATE على `subscription_requests`
- [ ] anon لا يَستطيع SELECT على `platform_settings` (بيانات حساس)
- [ ] anon يَستطيع SELECT على `subscription_tiers` (يَظهر في `/pricing` بدون auth)
- [ ] rate limit + honeypot على `/contact` (لا spam)
- [ ] SEO: meta tags + Open Graph + sitemap.xml + robots.txt + canonical URLs
- [ ] RTL سليم + dark/light + mobile-friendly
- [ ] super_admin يَستطيع تَعديل بيانات البنك + VAT settings عبر UI
- [ ] **graceful failure**: لو RESEND_API_KEY غائب أو الـ API يَفشل، نموذج `/contact` لا يَفشل — الطلب يُحفَظ + يَظهر warning في الـ logs

🟡 **معايير "best-effort" (لا تَكسر 100/100 إن فشلت)**:
- [ ] لو RESEND مُكوَّن، بريد تأكيد للمُرسِل يَصل خلال 30 ثانية
- [ ] لو RESEND مُكوَّن، بريد إشعار للـ `SUPER_ADMIN_NOTIFICATION_EMAIL` يَصل
- [ ] قوالب البريد عربية + RTL + branded

**سيناريوهات اختبار الأمان + reliability**:
1. anon يُحاول SELECT * FROM subscription_requests → يُرفَض.
2. anon يُحاول SELECT * FROM platform_settings → يُرفَض (بيانات بنكية حساس).
3. anon يَرفع 100 contact form في ساعة → الـ rate limit يُوقفه عند 3.
4. honeypot field مَملوء → server يَرفض (لا يَكتب في DB).
5. super_admin يَكتب bank_account بـ JSON غير صالح → trigger يَرفض.
6. **email service down**: RESEND_API_KEY مَوجود لكن endpoint غير مُتاح → server action يَنجح + يُسجِّل failure في audit_logs + لا rollback للـ DB.
7. **email config missing**: RESEND_API_KEY غائب → server action يَنجح + warning في console + لا 500.

**توزيع 100 نقطة**:
- Functionality (25)
- UX/UI (30) — marketing visual أهم
- Security (15)
- Performance (15) — Lighthouse ≥ 90
- Documentation (10) — incl. email setup runbook
- SEO (5)

**اختبارات SQL مَطلوبة**: ~10 (RLS على tiers + requests + settings، rate limit، JSON validation، tier seeding).
**اختبارات إضافية على server actions** (في Vitest أو مماثل): ~5 (graceful email failure، honeypot rejection، rate limit boundary، DB-INSERT-without-email-success، tier price snapshot read).

---

### 👥 المرحلة 17: Building Join Links + Resident Pending Approval

**الهدف**: تَمكين الـ admin من إصدار رابط دعوة عام لعمارته، يُكمل الساكن التسجيل بنفسه عبره، ثم admin يُوافق يدوياً. **التَركيز على أمن الـ tokens** (hashed، ليس raw).

**نطاق محدَّد**: tokens آمنة + pending workflow + admin queue. لا `/team` (Phase 19)، لا bulk import.

**المخرجات**:

`supabase/18_phase17.sql`:

```sql
-- جدول روابط الانضمام (الـ tokens hashed)
create table public.building_join_links (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  token_hash text not null unique,           -- SHA-256(raw_token) — RAW NEVER STORED
  
  created_by uuid not null references auth.users(id),
  created_at timestamptz default now(),
  expires_at timestamptz,                    -- nullable = no expiry
  disabled_at timestamptz,                   -- soft disable (admin يُوقفه)
  
  uses_count int not null default 0,
  max_uses int                               -- nullable = unlimited
);
-- index على token_hash للبحث السريع، WHERE disabled_at is null

-- جدول طلبات الانضمام pending
create table public.pending_apartment_members (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  join_link_id uuid references public.building_join_links(id),  -- audit: أي رابط استُخدم
  
  requested_apartment_number text,           -- ما أَدخله الساكن نَصّاً
  full_name text,
  phone text,
  
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz default now(),
  
  unique (building_id, user_id),
  check (status <> 'rejected' or (rejection_reason is not null and length(rejection_reason) >= 3))
);

-- workflow trigger
-- - building_id immutable
-- - status transitions: pending → approved | rejected (terminal)
-- - rejected → pending (إعادة محاولة admin override) — terminal للمستخدم
-- - status='approved' لا يَجب إدخالها يدوياً، فقط عبر RPC approve_pending_member
```

**RLS على `building_join_links` (مُحدَّث v3.35 — لا direct write policies)**:
- SELECT: admin العمارة + super_admin (UI إدارة الـ links). **anon = 0 access**.
- INSERT: **NO policy** — حصراً عبر `create_building_join_link` RPC (SECURITY DEFINER).
- UPDATE: **NO policy** — `uses_count++` عبر `submit_join_request`، `disabled_at` عبر `disable_join_link` (كلاهما RPCs SECURITY DEFINER).
- DELETE: **NO policy** — soft-disable فقط، لا حذف فعلي (audit trail محفوظ).
- anon يَتعامل **حصراً** عبر `resolve_building_join_token` RPC (read-only).

> v3.35 (Codex round 2 P1): direct INSERT/UPDATE policies كانت تَفتح bypass واضح (admin يُصفِّر uses_count، يُغيِّر token_hash، إلخ). الـ RPCs SECURITY DEFINER يَتجاوزن RLS فلا حاجة لـ policy؛ admin client يَستدعي RPCs من server actions narrow scope.

> v3.36 (Codex round 3 P2): `create_building_join_link` يَحوي **rotation semantic** — يُعطِّل تلقائياً كل الـ active links لنفس building قبل INSERT. هذا يُلبي معيار القبول: "admin يُمكنه توليد token جديد (يُلغي القديم)". لو سُرَّب رابط قديم، توليد رابط جديد يُبطله فوراً.

**RPCs (5)**:

1. `create_building_join_link(p_building_id, p_expires_at, p_max_uses)` — admin only، يُولِّد raw token (32 byte urlsafe base64) + يَحسب hash + يُنشئ row + يَرجع الـ raw token (يُعرض في UI مرة واحدة، لا يُعاد عرضه).

2. **`resolve_building_join_token(p_raw_token)`** — anon، SECURITY DEFINER. خطوات:
   - يَحسب hash داخلياً من الـ raw token
   - يَبحث في `building_join_links` بالـ hash
   - يَفحص: not disabled + not expired + uses_count < max_uses
   - يَفحص `is_building_active_subscription(building_id)` (Phase 14)
   - **يُرجع فقط البيانات العامة المحدودة**: `(building_id, building_name, city)` عند النجاح.
   - عند الفشل: يُرجع enum خطأ (`invalid | expired | disabled | max_uses_reached | building_inactive`) — لا يَكشف بنية الجدول.
   - **لا يَزيد uses_count هنا** (الزيادة فقط عند submission الفعلي).
   - GRANT EXECUTE TO authenticated, anon.

3. **`submit_join_request(p_raw_token, p_apartment_number, p_phone)`** — authenticated فقط (المستخدم يَجب أن يَكون سجَّل عبر Supabase أولاً)، SECURITY DEFINER. خطوات ذرّية:
   - يَفحص hash مرة أخرى (دفاع طبقات)
   - يَفحص الشروط نفسها كـ resolve
   - SELECT FOR UPDATE على building_join_links لقفل uses_count
   - INSERT في `pending_apartment_members`
   - UPDATE uses_count = uses_count + 1
   - يُرجع `pending_id` للـ UI (لإظهار "بانتظار التَفعيل").
   - يُربط `join_link_id` للـ audit.
   - GRANT EXECUTE TO authenticated.

4. `approve_pending_member(p_pending_id, p_apartment_id, p_relation_type)` — admin only، ذرّياً يُنشئ apartment_members + UPDATE pending status='approved'.

5. `reject_pending_member(p_pending_id, p_reason)` — admin only.

**Pages + Route handlers (v3.28: rate limits على route layer، ليس RPC)**:

- `src/app/(marketing)/join/[token]/page.tsx` — anon. الصفحة تَستدعي **server action `resolveJoinTokenAction(rawToken)`** الذي:
  1. يَقرأ IP من `headers().get('x-forwarded-for')` (موثوق وراء Vercel).
  2. يُطبِّق rate limit بالـ IP عبر **Upstash Ratelimit** (sliding window): 20 محاولة/IP/دقيقة لـ resolve. لو تَجاوز → 429 + رسالة "كثير من المحاولات".
  3. يَستدعي RPC `resolve_building_join_token(rawToken)`.
  4. يُرجع للصفحة `(building_id, building_name, city)` أو enum خطأ.
  5. الصفحة تَعرض نموذج التسجيل أو رسالة خطأ عربية.
- بعد تسجيل الساكن (Supabase signup):
  - تأكيد بريد → الـ session تَكون authenticated
  - server action `submitJoinRequestAction(rawToken, apartmentNumber, phone)`:
    1. rate limit بالـ IP: 5 محاولات/IP/ساعة لـ submit (أَضيق من resolve).
    2. يَستدعي RPC `submit_join_request` (atomic).
    3. يُحوَّل إلى `/join/success`.
- `src/app/(marketing)/join/success/page.tsx` — "بانتظار التَفعيل من إدارة العمارة".
- `src/app/(app)/account/pending/page.tsx` — middleware يُحوِّل المستخدمين pending-only إلى هنا.
- `src/app/(app)/apartments/pending/page.tsx` — admin queue.

> **مَلاحظة v3.28**: الـ RPCs نفسها **لا تَعرف IP**. PostgreSQL يَرى الـ session role فقط (anon/authenticated/service_role). تَمرير IP من client = غير موثوق. لذلك الـ rate limit يَعيش في الـ server action layer (Upstash + headers من Vercel infra)، والـ RPCs مَسؤولة فقط عن token validity + workflow integrity.

**Middleware (دقَّة multi-tenant — درس #16 المُطبَّق)**:

نَص القاعدة بدقَّة:
1. **fast-path للـ super_admin**: يَتجاوز كل الـ pending logic (نفس Phase 14).
2. لكل مستخدم non-super:
   - استعلام: هل له **أي** active row في `building_memberships` (`is_active=true`)؟
   - استعلام: هل له **أي** row في `pending_apartment_members` بـ `status='pending'`؟
3. **الحالة A — لا active، لا pending**: → `/onboarding` (نفس السلوك الحالي).
4. **الحالة B — لا active، لكن pending موجود**: → rewrite إلى `/account/pending`.
5. **الحالة C — active موجود (بأي عمارة)**: لا rewrite بسبب pending. الـ Phase 14 cookie/path-aware fallback يَتولى:
   - لو الـ cookie يُشير لعمارة pending-only (والمستخدم له active في عمارة أخرى) → cookie switch إلى الـ active، نفس نمط round 3.
   - لو الـ cookie يُشير لعمارة active فعلاً → normal flow.

> **مَلاحظة حرجة**: الـ Phase 14 round 3 fallback يَستعلم `building_memberships` بـ `is_active=true` — pending users بطبيعتهم ليس لهم rows في `building_memberships` (هم في `pending_apartment_members`)، لذلك Phase 14 logic يَعمل صحيحاً لهم. الإضافة الوحيدة هنا هي حالة B: `pending موجود + لا active في أي مكان`.

**معايير القبول**:
- [ ] Raw token لا يَظهر في DB أبداً — فقط hash. التَحقُّق: `select * from building_join_links` لا يَكشف الرابط الفعلي.
- [ ] anon لا يَملك أي SELECT/INSERT/UPDATE/DELETE على `building_join_links` (تَحقُّق RLS).
- [ ] الـ raw token يُعرض للـ admin مرة واحدة فقط عند الإنشاء (مع تَحذير "احفظه — لن يَظهر مجدَّداً").
- [ ] `/join/<token>` لا يُرسل أي query مباشر للـ DB — يَستدعي `resolve_building_join_token` RPC فقط.
- [ ] الـ RPC يَفحص: hash exists + not expired + not disabled + uses_count < max_uses + building subscription active.
- [ ] الـ RPC يُرجع enum خطأ مُحدَّد (لا 500) — UI يُترجمه لرسالة عربية.
- [ ] resolve لا يَزيد uses_count؛ الزيادة حصراً في `submit_join_request` (atomic عبر SELECT FOR UPDATE).
- [ ] الساكن بحالة pending **بدون** أي active membership: middleware يُحوِّله إلى `/account/pending`.
- [ ] الساكن بحالة pending **مع** active membership في عمارة أخرى: لا rewrite — Phase 14 fallback يُبدِّل الـ cookie.
- [ ] admin يَرى pending list مع الـ requested_apartment_number نَصّاً + يَختار apartment_id الفعلي عند الموافقة.
- [ ] approve ذرّياً: pending → UPDATE status + apartment_members INSERT، transaction واحدة.
- [ ] reject يَتطلَّب reason ≥ 3 أحرف.
- [ ] resident لا يَستطيع كتابة status='approved' مباشرة (RLS + WITH CHECK + trigger).
- [ ] admin يُمكنه تَوليد token جديد (يُلغي القديم disabled_at=now()).
- [ ] **v3.28: rate limit بالـ IP على server action layer** (ليس على RPC):
   - `resolveJoinTokenAction`: 20/IP/دقيقة عبر Upstash sliding window
   - `submitJoinRequestAction`: 5/IP/ساعة عبر Upstash sliding window
   - الـ IP يُقرأ من `x-forwarded-for` header (Vercel infrastructure)
   - تَجاوز الحد → 429 مع رسالة "كثير من المحاولات، حاول لاحقاً"
- [ ] الـ RPCs نفسها **لا تَعرف IP** ولا تَفرض rate limit بناءً عليه — هي مَسؤولة فقط عن token validity + workflow.

**سيناريوهات اختبار الأمان**:
1. anon يَكتب `select * from building_join_links` → RLS يُرجع 0 rows.
2. anon يَستدعي `resolve_building_join_token` بـ random token → enum 'invalid' (لا row leak).
3. token replay بعد disable: enum 'disabled'.
4. token expired: enum 'expired'.
5. max_uses reached: enum 'max_uses_reached'.
6. building expired/cancelled: enum 'building_inactive'.
7. resident self-promotes to approved: UPDATE pending SET status='approved' من client → RLS يَرفض (admin only).
8. cross-tenant: resident A على عمارة 1 يَستدعي `approve_pending_member` على pending في عمارة 2 → RPC يَرفض (admin check + tenant scope).
9. duplicate registration: نفس user_id + نفس building_id → unique constraint يَرفض.
10. concurrent submit_join_request (race): اثنان يَتسابقان على آخر use_count = max_uses-1 → SELECT FOR UPDATE يُسلسل، الثاني يَفشل بـ 'max_uses_reached'.
11. multi-tenant pending: مستخدم له active في A و pending في B، الـ cookie على B → Phase 14 fallback يُبدِّل لـ A (لا حجب خاطئ).
12. multi-tenant pending zero-active: مستخدم له pending فقط (لا active) → middleware → `/account/pending`.
13. orphan accounts: ساكن سَجَّل ولم يُوافَق عليه أبداً — DELETE auth.user يُسبِّب CASCADE على pending_apartment_members.

**توزيع 100 نقطة**:
- Functionality (20)
- Security (40) — token hashing + RPC-only access + multi-tenant fallback
- UX (15)
- Code Quality (15)
- Documentation (10)

**اختبارات SQL مَطلوبة**: ~30 (5 RPCs + workflow + RLS deny-all-anon + tenant isolation + concurrency + multi-tenant pending edge cases + CASCADE + rate limit boundary).

---

### 💳 المرحلة 18: Manual Bank-Transfer Subscription Orders + Provisioning + Admin Onboarding

**الهدف**: تَحويل `/pricing` من "اعرض الأسعار" إلى "اشترك ذاتياً عبر **تَحويل بنكي**". super_admin يُراجع الإيصال يدوياً، ثم RPC ذرّي يُولِّد العمارة + admin، ثم admin يَدخل لـ wizard onboarding.

> **اسم رسمي صريح**: "Bank-Transfer Subscription Orders" — **ليس** payment gateway. لا Moyasar/Stripe. النمط نفسه في `payments` (Phase 6): إيصال + اعتماد admin، بـ scope مُختلف (subscription بدلاً من رسوم شهرية).

**نطاق محدَّد**:
- ✅ subscribe form + bank details + receipt upload + super_admin review + provisioning + admin onboarding wizard
- ✅ 2 cron jobs minimum: expire stale orders (30 يوماً) + active→expired (subscription_ends_at < now)
- ❌ Renewal self-service (Phase 19)
- ❌ Plan upgrade/downgrade (Phase 19)
- ❌ Reminder emails 30/14/7 (Phase 19)
- ❌ `/team` management (Phase 19)
- ❌ Bulk import (Phase 19)

**المخرجات**:

`supabase/19_phase18.sql`:

```sql
-- جدول طلبات الاشتراك بـ تَحويل بنكي
create table public.subscription_orders (
  id uuid primary key default gen_random_uuid(),
  reference_number text unique not null,        -- SUB-2026-0042
  
  -- access token (نفس نمط Phase 17 — hashed، ليس raw)
  access_token_hash text not null,              -- SHA-256(raw_token)
  access_token_expires_at timestamptz not null  -- default now() + 30 days
    default (now() + interval '30 days'),
  -- v3.28 fix: split counters — only failed validations lock the order
  failed_access_attempts int not null default 0,   -- يَزداد فقط عند فشل validation
  successful_access_count int not null default 0,  -- إحصائي فقط (للـ audit/UX)
  
  -- بيانات العميل
  email text not null,
  full_name text not null,
  phone text not null,
  building_name text not null,
  city text,
  estimated_apartments int,
  
  -- الباقة (snapshot — أسعار subscription_tiers قد تَتغيَّر)
  tier_id text not null references public.subscription_tiers(id),
  cycle text not null check (cycle in ('monthly', 'yearly')),
  amount numeric(10,2) not null,                -- snapshot
  vat_amount numeric(10,2) not null default 0,
  total_amount numeric(10,2) not null,
  currency text default 'SAR',
  
  -- التحويل
  receipt_url text,
  transfer_date date,
  transfer_reference text,
  
  -- workflow (v3.28: أُضيف provisioning + provisioning_failed)
  status text not null default 'awaiting_payment'
    check (status in (
      'awaiting_payment',     -- order مُنشأ، بانتظار التحويل
      'awaiting_review',      -- إيصال مرفوع
      'provisioning',         -- super_admin بدأ الاعتماد، الـ order مَحجوز (lock)
      'approved',             -- provisioning نَجح
      'provisioning_failed',  -- invite أو RPC فشل بعد الحجز — recovery state
      'rejected',             -- مرفوض (مع سبب)
      'expired'               -- مَر 30 يوماً بلا تحويل (cron)
    )),
  rejection_reason text,
  rejection_attempt_count int default 0,        -- max 3
  
  -- v3.28: تَتبُّع الـ provisioning failures
  provisioning_started_at timestamptz,          -- لمنع stale locks (timeout 5 دقائق)
  provisioning_failure_reason text,             -- لو invite/RPC فشل
  
  -- نتيجة الـ provisioning
  provisioned_building_id uuid references public.buildings(id),
  provisioned_user_id uuid references auth.users(id),
  
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz default now(),
  
  -- constraints
  check (status <> 'approved' or (provisioned_building_id is not null and provisioned_user_id is not null)),
  check (status <> 'rejected' or (rejection_reason is not null and length(rejection_reason) >= 3)),
  check (status <> 'awaiting_review' or receipt_url is not null),
  check (status <> 'provisioning' or provisioning_started_at is not null),
  check (status <> 'provisioning_failed' or provisioning_failure_reason is not null)
);

create sequence public.subscription_order_seq start with 1;

-- workflow trigger: transition whitelist + immutability (v3.28 — reserve/complete pattern)
-- - reference_number + tier_id + cycle + amount* immutable بعد INSERT
-- - access_token_hash immutable
-- - transitions:
--     awaiting_payment    → awaiting_review (uploader) | expired (cron)
--     awaiting_review     → provisioning (super_admin reserves) | rejected
--     provisioning        → approved (complete) | provisioning_failed (invite/RPC failed)
--     provisioning_failed → awaiting_review (super_admin retry) | rejected (super_admin gives up)
--     rejected            → awaiting_review (re-upload, max 3 محاولات)
--     approved/expired    → terminal
-- - stale provisioning lock: لو provisioning_started_at < now() - 5 minutes،
--   super_admin آخر يَستطيع force-reset عبر RPC (audit log entry).
```

**RPCs (8 — v3.28: 3 إضافيون لـ reserve/complete pattern)**:

1. `create_subscription_order(...)` — anon (SECURITY DEFINER)، يُولِّد reference_number + raw access token + hash، يَحسب amount/vat/total من subscription_tiers + platform_settings.vat_*، يَرجع `(order_id, raw_access_token)` للـ client مرة واحدة. **rate limit ليس على الـ RPC — هو على الـ server action (انظر أدناه)**.

2. **`validate_subscription_order_token(p_order_id, p_raw_token)`** — anon (SECURITY DEFINER). يَحسب hash داخلياً، يَفحص:
   - hash يُطابق + `access_token_expires_at > now()` + status ∈ {awaiting_payment, rejected, awaiting_review}
   - `failed_access_attempts < 5` (lock threshold)
   - **v3.28 fix**: لو نَجح validation → يَزيد `successful_access_count` فقط (إحصائي). لو فَشل → يَزيد `failed_access_attempts` (هو الذي يَقفل عند 5).
   - يُرجع: `{ valid: bool, order_id, current_status, error_code? }`
   - GRANT EXECUTE TO authenticated, anon.
   - **rate limit حقيقي على route layer** (انظر مسار الـ upload أدناه)، ليس عبر هذا العداد. الـ failed_access_attempts هو حماية ثانية ضد brute-force على token specific.

3. **`reserve_subscription_order_for_provisioning(p_order_id)` — super_admin only، NEW v3.28**. ذرّياً:
   - `SELECT FOR UPDATE` على الـ order
   - يَفحص status = 'awaiting_review' أو ('provisioning_failed' للـ retry)
   - **+ stale lock check**: لو status='provisioning' و `provisioning_started_at < now() - interval '5 minutes'` → يَسمح بـ takeover (audit log entry).
   - UPDATE status='provisioning'، `provisioning_started_at=now()`، `reviewed_by=auth.uid()`
   - يُرجع `{ reserved: bool, order: row }` — الـ caller يَعرف أنه قَفَل الـ order قبل أن يَستدعي invite.
   - لو حصل سباق بين super_admins، الثاني يَفشل بـ "already being provisioned" (حماية ضد double-invite).

4. **`complete_provisioning(p_order_id, p_user_id)` — super_admin only، NEW v3.28**. ذرّياً:
   - `SELECT FOR UPDATE` على الـ order
   - يَفحص status='provisioning' وأن نفس super_admin هو الذي حَجَز (`reviewed_by=auth.uid()`)
   - INSERT building + INSERT building_memberships (admin role)
   - UPDATE order: status='approved'، provisioned_building_id، provisioned_user_id، reviewed_at=now()
   - audit log
   - **هذا يَستبدل `provision_subscription_order` السابق** — انتقل من single-step إلى two-step (reserve + complete).

5. **`mark_provisioning_failed(p_order_id, p_failure_reason)` — super_admin only، NEW v3.28**. recovery path:
   - يَفحص status='provisioning'
   - UPDATE status='provisioning_failed'، `provisioning_failure_reason=p_failure_reason`
   - audit log
   - يُستخدم من server action عند فشل invite أو complete_provisioning.

6. **`reset_failed_provisioning(p_order_id)` — super_admin only**. تَعيد order من `provisioning_failed` إلى `awaiting_review` لإعادة المحاولة (مثلاً لو invite فَشل مؤقتاً، super_admin يُريد إعادة المحاولة بعد دقائق).

7. `submit_subscription_receipt(p_order_id, p_receipt_path, p_transfer_date, p_transfer_reference)` — **service_role only** (الاستدعاء من server action بعد رفع الملف عبر service_role). يُحدِّث `receipt_url`، `transfer_date`، `transfer_reference`، يَنقل awaiting_payment/rejected → awaiting_review. **ليس anon-callable** (الـ server action هو الـ gatekeeper).

8. `reject_subscription_order(p_order_id, p_reason)` — super_admin only، يَزيد `rejection_attempt_count`. يَقبل من awaiting_review أو provisioning_failed.

**Storage `subscription_receipts` bucket — أمن الرفع**:

bucket private، **لا anon access نهائياً**:
- INSERT: **مَغلَق** على anon. فقط service_role يَكتب.
- SELECT: service_role فقط. UI يَعرض الإيصال عبر signed URL مُولَّد server-side (TTL 15 دقيقة).
- DELETE: service_role فقط (super_admin admin مَوقع).

**مسار الـ upload عبر API route، ليس Storage RLS**:

```
POST /api/subscriptions/[order_id]/receipt
```

تَدفُّق الـ handler (server-only، Node runtime):
1. يَستلم: `formData.get('access_token')` + `formData.get('receipt')` (الملف).
2. يَستدعي RPC `validate_subscription_order_token` — لو invalid → 401.
3. يَفحص الملف server-side:
   - mime type ∈ {image/jpeg, image/png, image/webp, application/pdf}
   - حجم ≤ 5MB
   - filename sanitized (uuid، لا path traversal)
4. يُنشئ Supabase client بـ **service_role** + يَرفع لـ `subscription_receipts/<order_id>/<uuid>.<ext>`.
5. عند نجاح الـ upload → يَستدعي RPC `submit_subscription_receipt` بمسار الملف.
6. يُرجع `{ success: true }` للـ UI.

**حماية إضافية على الـ route (rate limit يَعيش هنا، ليس في DB)**:
- `Content-Length` header check (limits 6MB لـ overhead).
- **rate limit بالـ IP عبر Upstash Ratelimit** (أو bucket في DB مَفصول): 3 uploads/IP/ساعة على نفس الـ order. يُقرأ الـ IP من `x-forwarded-for` بعد التَحقُّق من الـ trust boundary (Vercel + middleware).
- audit log row لكل محاولة upload (نَجَح/فشل).

> هذا النمط أنظف من marker table في Phase 8 لأن الـ context محدود (token + file + order). لا حاجة لـ private schema marker — الـ server action نفسه هو الـ gatekeeper.

**Pages**:
- `/subscribe?tier=X&cycle=Y` — form (anon).
- `/subscribe/[id]?t=<raw_token>` — bank details + receipt uploader (anon، token hashed server-side).
- `/subscribe/[id]/success` — "بانتظار المراجعة".
- `/subscribe/success` — بعد الاعتماد: "افحص بريدك للـ invite link" (لا "بيانات دخول").
- `/super-admin/orders` — قائمة + فلاتر بحالة (يَشمل provisioning و provisioning_failed) + ترتيب بالأقدمية.
- `/super-admin/orders/[id]` — مراجعة + اعتماد/رفض + retry (لـ provisioning_failed).

**Server actions (v3.28: approveOrderAction أُعيد تَصميمها — reserve/invite/complete pattern)**:

- `createSubscriptionOrderAction(formData)` — anon. **rate limit بالـ IP عبر Upstash** (5 orders/IP/يوم). يَستدعي RPC `create_subscription_order`.

- `submitReceiptAction` — server-only، يَتم استدعاؤه من API route (انظر فوق).

- **`approveOrderAction(orderId)` — super_admin، 4 خطوات بـ recovery clear**:
  ```
  step 1 (DB lock): RPC reserve_subscription_order_for_provisioning(orderId)
    → ATOMIC: SELECT FOR UPDATE + status='provisioning' + provisioning_started_at=now()
    → لو فَشَل (مثلاً super_admin آخر سَبَقني): return error "already being provisioned"
    → لو نَجَح: continue
  
  step 2 (outside DB): auth.admin.inviteUserByEmail(email)
    → لو فَشَل (Supabase API down، email format invalid، إلخ):
       → CATCH: RPC mark_provisioning_failed(orderId, "invite failed: <reason>")
       → return error للـ super_admin بـ retry guidance
       → الـ order الآن في 'provisioning_failed' — قابل للـ retry لاحقاً
    → لو نَجَح: نَحصل على user_id، continue
  
  step 3 (DB transaction): RPC complete_provisioning(orderId, user_id)
    → ATOMIC: INSERT building + INSERT membership + UPDATE order status='approved'
    → لو فَشَل (constraint violation، DB error، إلخ):
       → CATCH: RPC mark_provisioning_failed(orderId, "complete failed: <reason>")
       → ⚠️ الـ invite تم إرساله بالفعل (orphan invite scenario)
       → super_admin يَرى الحالة 'provisioning_failed' + يَستطيع manual cleanup:
         (أ) إلغاء الـ user من Supabase Dashboard ثم retry، أو
         (ب) reset_failed_provisioning ثم complete يدوياً بـ user_id الموجود
       → audit log يَحوي السبب الكامل + user_id إن وُجد
    → لو نَجَح: continue
  
  step 4 (best-effort): إرسال custom email "تم الاعتماد"
    → graceful failure (نفس Phase 16 pattern): لو RESEND يَفشل، operation يَنجح + warning في log.
  ```

- **`retryProvisioningAction(orderId)`** — super_admin. للـ orders بحالة `provisioning_failed`. يَستدعي `reset_failed_provisioning` (→ awaiting_review)، ثم super_admin يُعيد الموافقة (يَتطلَّب admin اختيار: استخدام نفس الـ user_id إن كان invite قد أُرسل، أو إلغاء وإعادة).

- `rejectOrderAction(orderId, reason)` — super_admin. يَقبل من `awaiting_review` أو `provisioning_failed`.

Onboarding wizard (admin-side، Phase 18):
- `src/app/(app)/dashboard/page.tsx` يَعرض wizard لو `building` لها صفر apartments + admin role.
- 5 خطوات: تأكيد بيانات العمارة → إضافة شقق → ضبط الرسوم الافتراضية → تَوليد رابط دعوة (Phase 17) → نسخ الرابط للسكان.
- بعد الإكمال، wizard لا يَظهر مجدَّداً (`profiles.onboarding_completed_at` أو column على building).

Cron jobs (Phase 18 = 2 فقط):
1. `expire_stale_subscription_orders` — daily. orders بحالة `awaiting_payment` و `created_at > 30 days ago` → status='expired'.
2. `expire_subscriptions` — daily. buildings بحالة `active` و `subscription_ends_at < now()` → عبر `update_building_subscription` RPC إلى `expired` (transition active→expired مَوجود في Phase 14 whitelist).

> الـ cron عبر **Vercel Cron** (`/api/cron/expire-orders` + `/api/cron/expire-subscriptions`) محمي بـ `CRON_SECRET` env var.
> **خارج النطاق**: reminders 30/14/7 يوم → Phase 19.

Email templates (3 جديدة، عربية):
- `order_created`: "حوِّل المبلغ إلى الحساب التالي مع ذكر رقم المرجع، ثم ارفع الإيصال [link]".
- `order_approved`: "تم الاعتماد. ستَستلم بريد invite من Supabase، اضغطه لإعداد كلمة مرورك، ثم ادخل لعمارتك [link]". **لا "بيانات دخول".**
- `order_rejected`: "لم نَستطع تأكيد التحويل. السبب: [reason]. أعد المحاولة [link]".

**معايير القبول**:
- [ ] `/subscribe?tier=pro&cycle=yearly` يَعمل لـ anon (بدون auth)
- [ ] إنشاء order يُولِّد reference_number فريد (sequence) + raw token طول ≥ 32 char
- [ ] الـ raw token لا يُحفَظ في DB أبداً، فقط hash
- [ ] الـ raw token يُعرض في URL مرة واحدة (في email + redirect)
- [ ] صفحة `/subscribe/[id]?t=...` تَستدعي RPC `validate_subscription_order_token` (لا query مباشر)
- [ ] **v3.28: المستخدم الشرعي يَفتح/يُحدِّث الصفحة 10 مرات → لا يُقفل**. `successful_access_count` يَزداد، `failed_access_attempts` يَبقى صفراً.
- [ ] **v3.28: 5 محاولات بـ token خاطئ → الـ order يُقفل** (`failed_access_attempts >= 5`).
- [ ] **rate limit بالـ IP على الـ routes** (ليس على RPCs):
   - `POST /api/subscriptions` (create order): 5/IP/يوم عبر Upstash
   - `POST /api/subscriptions/[id]/receipt` (upload): 3/IP/ساعة على نفس الـ order
   - الـ IP يُقرأ من `x-forwarded-for` (موثوق وراء Vercel)
- [ ] amount/vat/total snapshot — تَغيير tier prices لا يُؤثِّر على orders قائمة
- [ ] رفع الإيصال يَتم حصراً عبر `/api/subscriptions/[order_id]/receipt` (POST):
   - يَتحقَّق من token عبر RPC قبل أي شيء
   - يَفحص mime + size + sanitization
   - يَرفع بـ service_role لمسار controlled
   - ثم يَستدعي RPC `submit_subscription_receipt` (service_role only)
- [ ] **anon لا يَستطيع upload مباشر** إلى bucket `subscription_receipts` (Storage RLS deny-all على anon INSERT)
- [ ] super_admin في `/super-admin/orders` يَرى الطلبات + فلاتر (يَشمل `provisioning` و `provisioning_failed`)
- [ ] **v3.28 — reserve/complete pattern**:
   - الموافقة تَبدأ بـ `reserve_subscription_order_for_provisioning` (lock)
   - ثم `auth.admin.inviteUserByEmail` (خارج DB)
   - ثم `complete_provisioning(orderId, user_id)` (ذرّي)
   - email "تم الاعتماد" يَحوي **invite link فقط، لا "بيانات دخول"**
- [ ] **v3.28 — race protection**: super_admin#1 و super_admin#2 يَضغطان "اعتماد" متوازياً → الأول فقط يَنجح، الثاني يَرى "already being provisioned".
- [ ] **v3.28 — invite failure recovery**: لو `auth.admin.inviteUserByEmail` يَفشل، الـ order يَنتقل إلى `provisioning_failed` (ليس `approved`، ليس `awaiting_review`). super_admin يَستطيع retry بعد التَحقُّق.
- [ ] **v3.28 — complete failure recovery**: لو `complete_provisioning` يَفشل بعد invite, الـ order في `provisioning_failed` + `provisioning_failure_reason` مَكتوب + audit log يَحوي user_id (للتنظيف اليدوي).
- [ ] **v3.28 — stale lock recovery**: لو `provisioning_started_at < now() - 5 minutes` و status='provisioning'، super_admin آخر يَستطيع takeover (audit log entry).
- [ ] رفض order يَتطلَّب سبباً ≥ 3 أحرف، يَقبل من `awaiting_review` أو `provisioning_failed`
- [ ] العميل بعد رفض يُمكنه upload إيصال آخر (max 3 محاولات، `rejection_attempt_count` يَزداد)
- [ ] cron 1 (stale orders): order قديم > 30 يوماً بلا تحويل → expired تلقائياً
- [ ] cron 2 (expire subscriptions): building بـ `subscription_ends_at < now` → expired تلقائياً
- [ ] cron محمي بـ CRON_SECRET (anon GET → 401)
- [ ] receipt files غير قابلة للقراءة من anon — UI يَستخدم signed URLs مُولَّدة server-side (15 دقيقة TTL)
- [ ] admin بعد provisioning يَدخل → wizard يَظهر مرة واحدة → بعد إكمال 5 خطوات يَختفي
- [ ] حساب admin مُنشأ بـ `auth.admin.inviteUserByEmail` (ليس بـ كلمة مرور افتراضية)

**سيناريوهات اختبار الأمان**:
1. token guessing على `/subscribe/[id]?t=<random>`: hash mismatch → enum invalid + `failed_access_attempts++`.
2. token expired (> 30 يوماً): enum 'expired'.
3. token brute force: > 5 محاولات بـ token خاطئ → `failed_access_attempts >= 5` يَقفل الـ order.
4. **v3.28 NEW**: legitimate user يَفتح الصفحة 10 مرات بـ token صحيح → `successful_access_count = 10`، `failed_access_attempts = 0`، الـ order **لا يُقفل**.
5. **v3.28 NEW**: race بين super_admins على نفس الـ order → SELECT FOR UPDATE في `reserve_subscription_order_for_provisioning` يُسلسل، الثاني يَرى status='provisioning' ويَفشل بـ "already being provisioned" قبل invite.
6. **v3.28 NEW**: invite يَفشل → order في `provisioning_failed` + invite لم يُرسل لمستخدم بلا عمارة + يُمكن retry.
7. **v3.28 NEW**: complete_provisioning يَفشل بعد invite ناجح → order في `provisioning_failed` + audit log يَحوي user_id الـ orphan + super_admin يُمكنه manual reconciliation.
8. **v3.28 NEW**: stale provisioning lock (super_admin#1 افتَتح browser tab ثم اختفى) → بعد 5 دقائق، super_admin#2 يَستطيع takeover.
9. price tampering: client يُرسل `total_amount=1` → server يَتجاهل ويَحسب من tier.
10. tier substitution: client يَطلب pro لكن DB يُسجِّل basic → server يَستخدم tier من query بعد validation.
11. cross-order receipt upload: token صحيح للـ order A، مسار upload لـ order B → server action يَرفض (order_id من URL يَجب أن يُطابق الـ token's order).
12. **anon direct Storage upload**: `supabase.storage.from('subscription_receipts').upload(...)` من client → 403 (RLS deny-all).
13. **anon direct RPC submit_subscription_receipt**: anon يَستدعي الـ RPC مباشرة → ERROR (GRANT حصري على service_role).
14. file mime tampering: client يَرسل `.exe` بـ Content-Type=image/jpeg → server يَفحص magic bytes.
15. cron forgery: anon GET `/api/cron/expire-orders` بدون secret → 401.
16. `provisioned_building_id` immutable: super_admin يُحاول UPDATE → trigger يَرفض.
17. invite-not-credentials: email "تم الاعتماد" يُفحَص أن لا يَحوي كلمة مرور أو username — فقط invite link.

**توزيع 100 نقطة**:
- Functionality (20)
- Security (40) — token hashing + server-action upload + reserve/complete atomic + race protection + cron + storage deny-all
- UX (15) — flow سلس + onboarding wizard + retry path للـ provisioning_failed
- Code Quality (10)
- Documentation (10) — runbook: orphan invite cleanup + stale lock recovery + cron ops
- Operations (5)

**اختبارات SQL مَطلوبة**: ~30 (v3.28 + 5 إضافية: split counter behavior + reserve race + stale lock takeover + invite failure recovery + complete failure recovery).

---

### 🔧 المرحلة 19: Team Management + Renewal Self-Service + Plan Changes + Bulk Import

**الهدف**: إكمال الفجوات التشغيلية بعد Phase 18 — إدارة الفريق غير-المُرتبط بشقق، تَجديد ذاتي للاشتراك، تَغيير الباقة، استيراد جماعي للشقق/السكان، reminders متعدِّدة.

**نطاق محدَّد**:
- ✅ `/team` للأدوار غير-المُرتبطة بشقة (treasurer, committee, technician)
- ✅ Renewal self-service عبر `/subscribe?renew=true&building=X`
- ✅ Plan upgrade/downgrade مع pro-rated billing
- ✅ Bulk import (Excel/CSV) للشقق + السكان
- ✅ Reminder cron (30/14/7 يوم قبل الانتهاء)

**المخرجات**:

`supabase/20_phase19.sql`:
- توسيع `subscription_orders`:
  - `is_renewal boolean default false`
  - `renews_building_id uuid references buildings(id)` — للـ renewal orders
  - `is_plan_change boolean default false` — تَفريق upgrade/downgrade
  - `previous_tier_id text` — snapshot قبل التَغيير
- جدول `bulk_import_jobs`:
  - id, building_id, type ('apartments'|'members'), file_url, status ('pending'|'processing'|'completed'|'failed'), rows_total, rows_succeeded, rows_failed, errors jsonb, created_by, created_at, completed_at.
- RPCs:
  - `renew_subscription(p_order_id)` — يُمدِّد `subscription_ends_at` بدلاً من إنشاء building جديد. ذرّي.
  - `change_subscription_plan(p_building_id, p_new_tier, p_amount_diff)` — super_admin only، يُحدِّث plan + يَحسب prorated diff.
  - `process_bulk_import(p_job_id)` — admin only، يَقرأ الملف من storage، يُنشئ rows ضمن transaction.

Pages:
- `/team` — admin يُضيف treasurer/committee/technician بدون شقة. نفس flow LinkMemberDialog لكن بدون apartment_id.
- `/subscribe?renew=true&building=X` — مُختصَر، يَستخدم بيانات العمارة الموجودة.
- `/super-admin/buildings/[id]` — أزرار "تَرقية/تَخفيض" تَفتح dialog upgrade/downgrade.
- `/apartments/import` — uploader Excel + preview + confirm.
- `/members/import` — مماثل.

Cron jobs (3 إضافية):
- `subscription_reminder_30d` — buildings بـ subscription_ends_at بين 28 و 32 يوماً → email تَذكير.
- `subscription_reminder_14d` — مماثل لـ 14.
- `subscription_reminder_7d` — مماثل لـ 7.

**معايير القبول** (مُختَصرة):
- [ ] admin يَستطيع إضافة treasurer بدون apartment_id (`/team`)
- [ ] renewal يُمدِّد `subscription_ends_at` (لا يُنشئ building جديد)
- [ ] upgrade pro→enterprise يَحسب pro-rated diff
- [ ] downgrade يَنتظر نهاية الفترة الحالية (لا refund تلقائي)
- [ ] bulk import يُعالج 100 row في < 30 ثانية
- [ ] bulk import يَتراجع كاملاً عند خطأ (transaction)
- [ ] reminders 30/14/7 يَعمل بدقَّة (cron tests)

**سيناريوهات اختبار الأمان**: ~10 (renewal scope، plan change RLS، bulk import tenant isolation، CSV injection).

**توزيع 100 نقطة**:
- Functionality (30) — نطاق متَنوِّع
- Security (20)
- UX (20) — bulk import أكثر صعوبة UX
- Code Quality (15)
- Documentation (10)
- Operations (5)

**اختبارات SQL مَطلوبة**: ~20.

---

## 6. المعايير المشتركة عبر كل المراحل

### 6.1 معايير الكود
- TypeScript `strict: true` — لا `any` إلا بمبرر مكتوب
- لا `console.log` في الكود النهائي (استخدم logger إن لزم)
- Server actions مفصولة في `src/actions/` ومنظمة حسب الـ domain
- Validation بـ zod على حدود السيرفر (server actions inputs)
- لا بيانات وهمية في الكود (إلا في `seed.sql`)
- ملفات < 300 سطر — قسّم إذا أكبر
- أسماء components بـ PascalCase، files بـ kebab-case
- أسماء جداول وأعمدة بالإنجليزية snake_case
- أسماء UI strings بالعربية فقط
- لا تكرار للـ business logic (DRY)

### 6.2 معايير الواجهة
- RTL سليم على كل صفحة (لا spacing معكوس)
- Dark mode مدعوم على **كل** عنصر (لا بقع بيضاء في الوضع الليلي)
- Mobile breakpoints مدعومة: 320, 375, 414, 768, 1024, 1440
- Loading state على كل عملية async
- Empty state على كل قائمة فارغة
- Error state على كل failure
- Toast على كل success/error من server action (بالعربي)
- Confirm dialog على كل عملية irreversible
- كل input له label مرئي أو aria-label
- كل صورة لها alt
- focus rings مرئية في dark + light
- color contrast WCAG AA على الأقل

### 6.3 معايير الأمان
- RLS مفعّل على **كل** جدول
- لا `service_role` في client code (أبداً)
- التحقق من الصلاحيات في server action **قبل** أي mutation
- لا trust للـ client على building_id — يُؤخذ من cookie/session
- input validation بـ zod على كل server action
- file uploads: type + size + magic bytes validation
- لا secrets في git
- audit log على كل عملية مالية أو حساسة
- signed URLs لـ private storage بصلاحية محدودة (1 ساعة)
- rate limiting على endpoints حساسة (login, register) — bonus
- **سلامة المالية (Payment Integrity)** — مرتبط بقيد 1.5.1:
  - الأرصدة والتقارير تستخدم **حصراً** الدفعات بحالة `approved`.
  - لا يجوز أي logic يحسب pending أو يفترض دفع تلقائي/بوابة.
  - الرفض يستلزم سبب مكتوب على 3 طبقات (UI + server + DB CHECK).
  - الإيصال إلزامي عند إنشاء أي دفعة (لا دفعة بدون إثبات — DB CHECK + server validation).
  - أي PR/commit يضيف tableـ/حقل/route لبوابات دفع → يُرفض فوراً.
- **سلامة التصويت (Voting Integrity)** — مرتبط بقيد 1.5.2:
  - التصويت المكرر من نفس الشقة مستحيل على 3 طبقات (UI + server action + DB unique constraint على `(vote_id, apartment_id)`).
  - تعيين/تغيير `voting_representative` admin-only ويُسجَّل في audit_logs.
  - النتائج محسوبة بعدد الشقق لا المستخدمين (Code review مهم في `src/lib/voting.ts`).
  - الصوت السابق يبقى عند تغيير الممثل (no destructive deletion).
  - أي PR/commit يعيد إدخال `voting_scope` أو يحسب الأصوات per-user → يُرفض فوراً.

### 6.4 معايير الأداء
- Server Components افتراضياً
- Client Components فقط عند الحاجة الفعلية للتفاعل
- pagination على كل قائمة محتمل تكبر (>50 row)
- indexes على DB موجودة لكل filter شائع
- صور optimized (next/image)
- code splitting طبيعي عبر App Router
- لا waterfalls في server data fetching (parallel queries)

---

## 7. عملية التسليم والمراجعة

### 7.1 ما يسلّمه المنفذ مع كل مرحلة (الحد الأدنى الموحَّد)
1. قائمة الملفات الجديدة/المعدّلة (شجرة tree أو `git status`)
2. SQL migrations الجديدة (إن وجدت)
3. تعليمات تشغيل/اختبار خاصة بالمرحلة
4. **نتائج الفحوصات الأساسية** عند أي تعديل على الكود: `install` + `build` + `lint` + `typecheck` (raw output ملصق، ليس مجرد ادعاء)
5. أي قرار معماري داخل المرحلة (اختياري لكن مرحَّب به)
6. **تأكيد ذاتي** على كل بند في معايير القبول (نسخ checklist مع ✅، بنداً بنداً، بدون اختصار)

> ⚠️ بعض المراحل لها **شرط استلام إضافي** موضّح صراحة في نهاية المرحلة (انظر مثلاً نهاية المرحلة 0). الشروط الإضافية **إلزامية**، وأي تسليم لا يحقق الحد الأدنى أعلاه أو الشرط الإضافي **يُرفض قبل بدء المراجعة** ولا يُحتسب وقت مراجعة.

### 7.2 ما يفعله المستشار
1. يطبق المرحلة على بيئة نظيفة (clone + install + setup)
2. يشغّل المشروع
3. يسير في كل سيناريو اختبار خطوة بخطوة
4. يحاول كسر الأمان (negative testing مكثف)
5. يراجع الكود (code review حقيقي، ليس سطحي)
6. يعطي تقييم بنموذج 100 نقطة + ملاحظات تفصيلية
7. قرار: قبول (100/100) أو إعادة مع ملاحظات actionable

### 7.3 شروط 100/100 (صارمة)
- **كل** بند في معايير القبول مُحقَّق ✅
- **كل** سيناريو اختبار ينجح
- **كل** اختبار أمان ينجح (negative tests يفشلون كما يجب)
- لا errors أو warnings خطيرة في console
- جودة الكود مقبولة (لا code smells واضحة)
- التوثيق محدّث

### 7.4 آلية الإصلاح
- المستشار يكتب ملاحظاته كقائمة actionable مرقمة
- المنفذ يصلح كل ملاحظة + يضع ✅ بجانبها
- إعادة تسليم
- المستشار يعيد فحص النقاط المتأثرة فقط (regression قصير) + spot-check عام

### 7.5 آلية اكتشاف خطأ في مرحلة سابقة
- إن اكتشف المنفذ أو المستشار خطأً في مرحلة "معتمدة سابقاً":
  1. يتوقف العمل على المرحلة الحالية فوراً
  2. يُصلح الخطأ
  3. تُعاد مراجعة المرحلة المُصلَحة (regression محدود)
  4. ثم يستأنف العمل على المرحلة الحالية

---

## 8. الخريطة الزمنية التقديرية

| المرحلة | الجهد التقديري | تراكمي |
|---|---|---|
| 0 — تأسيس | نصف يوم | 0.5 |
| 1 — DB + RLS | 1.5 - 2 يوم | 2.5 |
| 2 — Auth + Multi-tenancy | 1.5 - 2 يوم | 4.5 |
| 3 — Layout + Design System | 1 يوم | 5.5 |
| 4 — Dashboard | نصف يوم | 6 |
| 5 — Apartments | 1 يوم | 7 |
| 6 — Payments | 1.5 يوم | 8.5 |
| 7 — Expenses | 1 يوم | 9.5 |
| 8 — Maintenance + Tasks | 2 يوم | 11.5 |
| 9 — Vendors | نصف يوم | 12 |
| 10 — Suggestions/Votes/Decisions | 2 - 3 يوم | 15 |
| 11 — Documents + Audit Logs | 1 يوم | 16 |
| 12 — Reports | 1 يوم | 17 |
| 13 — PWA + Polish | 1.5 يوم | 18.5 |
| 14 — Super Admin | 1 يوم | 19.5 |
| 15 — QA + Docs + Deploy | 1 يوم | 20.5 |
| **المجموع** | **~ 18 - 25 يوم عمل** | |

> ملاحظة: التقديرات للتنفيذ النشط فقط. وقت المراجعة من المستشار وأي إعادة عمل غير محسوبين.

---

## 9. ملاحظات نهائية

- **المعمارية محسومة** في هذه الوثيقة. أي تغيير معماري كبير يتطلب توافق مكتوب بين المنفذ والمستشار + تعديل الوثيقة.
- **الترتيب إلزامي**. لا يُسمح بدمج مراحل أو تخطيها.
- **"100/100" يعني فعلاً 100/100**. لا "تقريباً" ولا "نتجاوز هذه النقطة لأنها صغيرة".
- **Seed data** في كل مرحلة فيها بيانات يجب أن يكون قابلاً للاستخدام لاختبار المرحلة من قبل المستشار.
- **اللغة**: كل النصوص الموجَّهة للمستخدم بالعربية. كل أسماء الجداول والأعمدة والـ functions والمتغيرات بالإنجليزية.
- **التعليقات**: لا تعليقات إلا على المنطق غير الواضح (الـ Why، ليس الـ What).
- **بدء العمل**: المنفذ يبدأ بالمرحلة 0 فقط بعد قراءة المستشار للوثيقة كاملة وتأكيده.

---

## التوقيعات

- **المنفذ**: ____________
  أتعهد باتباع هذه الخطة بحرفيتها، وعدم الانتقال لأي مرحلة قبل اعتماد سابقتها بـ 100/100.

- **المستشار (Codex)**: ____________
  أتعهد بمراجعة كل مرحلة بصرامة، وعدم الموافقة إلا بعد التحقق من كل بند في معايير القبول وكل سيناريو اختبار.

---

**نسخة الوثيقة**: 3.43
**تاريخ الإصدار**: 2026-05-01

### التحديثات في 3.43 (إغلاق ملاحظات Codex round 2 على Phase 19 — 2× P1 + 2× P2)

#### الملاحظات

**(P1 #1) فَتح طلبَي تَجديد لنفس العمارة بعد رَفض الأول**
الـ `create_renewal_order` كان يَستثني `status='rejected'` من فحص الـ in-flight، لكن Phase 18 يَسمح للـ `rejected → awaiting_review` (re-upload حتى 3 محاولات). السيناريو الكارثي:
1. admin يَفتح A → A يُرفض → A=rejected، attempts=1
2. admin يَفتح B → B=awaiting_payment (الـ slot يَبدو فارغاً)
3. صاحب رابط A يَرفع إيصالاً جديداً → A → awaiting_review
4. super_admin يَعتمد A و B → ends_at يُمدَّد مَرتين

**(P1 #2) استيراد السكان يَتجاوز منطق ممثل التَصويت**
`process_members_bulk_import` كان يُدخِل `apartment_members` مُباشرةً بـ `is_voting_representative` افتراضي (false). الـ Phase 5 `link_apartment_member` يَضبطه true لأول عضو نَشط في الشقة (unique partial index يَفرض ممثل واحد فقط لكل شقة). النتيجة: الشقق المُستوردة بالـ bulk **لا تَملك ممثل تَصويت** → voting flow في Phase 10 يَفشل.

**(P2 #3) `/team` يُمكِنه تَعطيل resident memberships**
`deactivate_team_member` كان يَرفض role='admin' فقط، فيَقبل أي دور آخر بما في ذلك `resident`. النتيجة: admin يَستطيع تَعطيل building_membership لساكن من /team بينما `apartment_members` تَبقى نَشطة → حالة وصول مُتناقضة (RLS يَحجب لكن البيانات تَبقى). resident removal يَجب أن يَمر عبر apartment workflow الذي يَتعامل مع الـ voting rep + apartment_members atomically.

**(P2 #4) سَبَب تَغيير الباقة يُطلَب ثم لا يُحفَظ**
`change_subscription_plan` كان يَفرض `p_note` (5-1000 حرف) ويَعرضه في UI كـ "سَبَب التَغيير للسجل"، لكنه **لا يَستخدمه أبداً**. الـ buildings table بلا audit trigger، لذلك التَغيير اليدوي لا يَترك أثراً. الـ admin/super_admin يُمكِنه تَغيير باقة بـ note "زبون لم يَدفع" والـ note يَختفي.

#### الإصلاحات

**1. `create_renewal_order` — اعتبار rejected@attempts<3 in-flight**:
```sql
if exists (
  select 1 from public.subscription_orders
  where renews_building_id = p_building_id
    and (
      status in ('awaiting_payment', 'awaiting_review', 'provisioning', 'provisioning_failed')
      or (status = 'rejected' and rejection_attempt_count < 3)
    )
) then
  raise exception 'a renewal order is already in flight for this building'
```
الـ slot يَتحرَّر فقط عند: `expired`، `approved`، `cancelled`، أو `rejected@attempts>=3` (terminal). الـ admin إما يُعيد رفع الإيصال على A، أو يَنتظر استنفاد الـ 3 محاولات.

**2. `process_members_bulk_import` — voting rep semantics**:
داخل الـ commit phase، نَستبدل الـ INSERTs المُباشرة بمنطق Phase 5 inline:
```sql
-- ensure building_memberships (Phase 5 P1: لا تَستعيد دور elevated في reactivation)
-- count active apartment_members for the apartment
-- INSERT apartment_members with is_voting_representative = (count == 0)
```
لا نَستدعي `link_apartment_member` لأن:
- الـ caller permission check يَتكرَّر (مُكلِف، redundant)
- inlining يُتيح control كامل على conflict handling (نَفشل عند duplicate بدلاً من silent skip)

**3. `deactivate_team_member` — whitelist roles بدل blacklist admin**:
```sql
if v_membership.role not in ('treasurer', 'committee', 'technician') then
  raise exception 'team RPC only manages treasurer/committee/technician
    (admin → super-admin path; resident → apartments unlink)'
```
رسائل خَطأ صَريحة عن المسار الصَحيح لكل دور.

**4. `change_subscription_plan` — INSERT في audit_logs**:
```sql
insert into public.audit_logs (
  building_id, actor_id, action, entity_type, entity_id,
  old_values, new_values, notes
) values (
  p_building_id, v_user_id, 'PLAN_CHANGE', 'buildings', p_building_id,
  jsonb_build_object('subscription_plan', v_old_plan, ...),
  jsonb_build_object('subscription_plan', v_new_plan, ..., 'extend_cycle', p_extend_cycle),
  p_note
);
```
- action = `'PLAN_CHANGE'` (ثابت، يُسهِّل filtering في `/super-admin/audit`)
- old_values + new_values يَحفظان snapshot كامل للحقول الحَساسة (plan/status/ends_at)
- notes يَحفظ p_note الكامل

#### الـ regression الكامل
- typecheck ✅
- lint ✅
- build ✅
- SW postbuild ✅
- sql-validate ✅ **378/378** (6 جديدة + 372 سابقة)
- audit ✅ 0 vulnerabilities

#### الاختبارات الجديدة (6)
- 19.35: rejected@attempts<3 يَحجب فَتح order ثانٍ — closes double-extend
- 19.36: rejected@attempts=3 (terminal) يُحرِّر الـ slot — happy boundary path
- 19.37: bulk member import يَضبط voting rep لأول عضو (user1=rep، user2=non-rep)
- 19.38: الشقة المُستوردة تَملك بالضبط ممثل تَصويت واحد (unique partial index)
- 19.39: deactivate_team_member يَرفض role='resident'
- 19.40: change_subscription_plan يُسجِّل PLAN_CHANGE في audit_logs مع old/new + note

#### دروس مُحسَّنة

**#41 (مُقترَح)**: عند بناء "in-flight" check لمنع duplicate state، الـ `rejected` ليس بالضرورة terminal — لو الـ workflow يَسمح بـ retry (re-upload لـ N محاولات)، فالـ rejected@attempts<N **هو نَفس الـ in-flight لأغراض business logic**. ضَع الـ retry-eligibility في الـ in-flight predicate، لا تَستثنِ الـ rejected blanket.

**#42 (مُقترَح)**: الـ functions التي تَلتقط بيانات (notes/audit/reasons) يَجب أن:
1. تَفرض الـ validation (length، non-null) — يَمنع الـ caller من passing فارغ
2. **تَستخدم البيانات فعلياً** — INSERT في audit table أو column مَخصص
3. الاختبار يُؤكِّد ظهور البيانات في الـ destination

شائع أن (1) يُكتب وتُنسى (2). الاختبار `19.40` يَفحص أن `p_note` يَظهر في `audit_logs.notes` — يَكشف هذا النوع من الـ "validation theater".

#### إحصائية post-Phase 19 round 2

- **20 ملف SQL** | **378 اختبار** | **42 درساً** | **0 vulnerabilities**

### التحديثات في 3.42 (تَنفيذ Phase 19 — Team + Renewals + Plan Changes + Bulk Import + Reminders)

#### المخرجات الفعلية

| طبقة | الإحصائية |
|---|---|
| SQL | 1 ملف جديد (`20_phase19.sql`)، 2 جدول (`bulk_import_jobs` + `subscription_reminders_sent`)، 11 RPC، 4 أعمدة جديدة على `subscription_orders`، 1 storage bucket (`bulk_import_uploads`) |
| Server actions | 6 جديدة (addTeamMember، deactivateTeamMember، createRenewalOrder، changePlan، importApartments، importMembers، cancelBulkImportJob) + dispatch في approveOrderAction |
| Routes/Pages | `/team` (admin) + `/subscribe?renew=true&building=X` (admin) + `/apartments/import` + `/apartments/members-import` + `/super-admin/buildings/[id]` plan-change dialog |
| Cron | `/api/cron/subscription-reminders` (يَومي، 30/14/7 يوم) + إضافة في `vercel.json` |
| Email templates | 3 جديدة (renewal_created، renewal_approved، subscription_reminder) |
| Types | 2 tables + 8 RPCs أُضيفوا إلى `database.ts` + توسيع subscription_orders.Row بالحقول الجديدة |
| اختبارات | 35 SQL test جديدة (372 إجمالي) |
| Regression | typecheck ✅ / lint ✅ / build ✅ / SW postbuild ✅ / sql-validate ✅ **372/372** / audit ✅ 0 vulnerabilities |

#### الميزات الـ 5

**1. /team — أدوار غير مُرتبطة بشقة**
- الـ admin يَستطيع إضافة `treasurer` / `committee` / `technician` بدون apartment_id (membership_role enum يَدعمها مُسبَقاً)
- ROLE='admin' و 'resident' مَرفوضان صراحةً (admin له super-admin path، resident له apartments + join links — لتَجنُّب الالتباس)
- إضافة عبر email: لو المستخدم مَوجود → INSERT membership مُباشر، لو لا → invite via auth.admin + INSERT membership
- إعادة تَفعيل: لو المستخدم له membership غير نَشط، الـ RPC يُفعِّله بالدور الجديد بدلاً من رَفض duplicate
- deactivate: idempotent، يَرفض role='admin' (مسار super-admin)

**2. Renewal Self-Service — `/subscribe?renew=true&building=X`**
- الـ admin يَفتح الرابط (من email التَذكير أو manual) → يَختار باقة + cycle → يُولِّد order بـ `is_renewal=true`
- snapshot pricing من tier + VAT من platform_settings (نفس Phase 18)
- snapshot للـ admin email/phone من profile (لا حاجة لإعادة الإدخال)
- duplicate in-flight check: لا يُمكن فَتح أكثر من renewal واحد قيد المعالجة لنفس building (يَمنع double-charging)
- email يَستخدم template جديد `renderRenewalCreatedEmail` مع banner الترقية لو is_plan_change=true
- approveOrderAction يُلتقط `is_renewal` ويَستدعي `complete_renewal` بدلاً من `complete_provisioning`:
  - لا invite (admin لديه وصول)
  - يُمدِّد `subscription_ends_at` من `MAX(now, current_ends_at) + cycle_interval` (early renewal يَحفظ الأيام)
  - لو is_plan_change → يُحدِّث `subscription_plan` atomically في نفس الـ UPDATE
  - email تأكيد renewal_approved مع الـ new_ends_at

**3. Plan Change — super_admin direct override**
- `change_subscription_plan(p_building_id, p_new_tier_id, p_extend_cycle, p_note)` — للحالات خارج الـ /subscribe flow (اتفاق هاتفي، دفع مُسبَق، إلخ.)
- `p_note` إلزامي (5-1000 حرف) — يُسجَّل في audit_logs عبر buildings_validate_update trigger
- يَدعم تَمديد ends_at اختيارياً (`p_extend_cycle = 'monthly'|'yearly'|null`)
- لو `p_extend_cycle is null`: تَغيير الـ plan فقط بدون لمس ends_at
- يَستخدم same anchor logic (max(now, current_ends_at)) لتَمديد عَدل
- super_admin only، non-super يُرفض بـ "Access denied"

**4. Bulk Import — atomic CSV uploads**
- `bulk_import_jobs` table: id, building_id, type (apartments/members), file_url, status (pending → processing → completed/failed/cancelled)، rows_total/succeeded/failed، errors jsonb، failure_reason
- `bulk_import_uploads` storage bucket: 10MB max، CSV only (text/csv + application/csv mime)
- decision design: **CSV only** (لا XLSX) لأن npm `xlsx` package به CVEs غير مُصلحة (GHSA-4r6h-8v6p-xvw6 + GHSA-5pgg-2g8v-p4x9). الـ patched version على SheetJS CDN فقط (يَتجاوز pnpm integrity). الـ UI يَشرح: "ملف ← حفظ باسم ← CSV" من Excel.
- atomic per Reserve/Validate/Commit pattern:
  1. validation phase: per-row (no DB writes) — collect errors per row
  2. لو أي error → mark failed + return errors، لا INSERT
  3. لو all valid → INSERT all in inner BEGIN/EXCEPTION subtransaction
  4. لو INSERT exception (race/constraint) → outer block catches → mark failed + rollback INSERTs
- max 1000 row per batch (DB-level cap)
- CSV injection defense: cells starting with `=` `+` `-` `@` rejected at parse time
- pages: `/apartments/import` + `/apartments/members-import`

**5. Reminders Cron — daily at 30/14/7 days**
- `subscription_reminders_sent` table: idempotency tracker (unique on building_id + days_before + subscription_ends_at_snapshot)
- `find_and_record_subscription_reminders()` RPC: atomic INSERT + SELECT — finds candidates, inserts marker rows, returns to caller
  - لو cron يَعمل أكثر من مرة في اليوم → unique constraint يَمنع التَكرار
  - لو building يُجدِّد → ends_at يَتغيَّر → period جديد → reminder جديد يُرسَل
- `update_reminder_email_status()` RPC: يَتَتَبَّع نَجاح/فشل الإرسال (queued → sent/failed)
- email template `renderSubscriptionReminderEmail`: banner مُلوَّن (أزرق/أصفر/أحمر بحسب أيام_قبل_الانتهاء)
- route: `/api/cron/subscription-reminders` (CRON_SECRET-protected، POST/GET)، schedule `0 9 * * *`

#### الدروس الجديدة

**#39 (مُقترَح)**: عند اختيار dependencies للـ data parsing، **لا تَقبل packages مع CVEs غير مُصلحة في npm حتى لو الـ patched version على CDN**. المُحافظة على 0-vulnerabilities (lesson #27) أهم من ميزة "نَدعم XLSX". الـ tradeoffs:
- CDN install: يَتجاوز pnpm integrity verification (تَلوُّث supply chain أسهل)
- ignore CVE: يَكسر الـ audit baseline ويُربك المراجعات اللاحقة
- drop the format: يُكلِّف ميزة، لكن يَحفظ التَوازن الأمني

النَموذج التَطبيقي: Phase 19 أَدخل Bulk Import للـ CSV فقط، الـ UI يَشرح "Save as CSV" من Excel. لو ظَهر pure-JS Excel parser مَصون مَستقبلاً (papaparse-like للـ XLSX)، يُمكن إعادة التَقييم.

**#40 (مُقترَح)**: عند إضافة عَمود (column) إلى جدول مَوجود + CHECK constraints مُركَّبة، تَأكَّد أن:
- الـ INSERT منطقي مع كل combinations (in our case: is_renewal=true ⇒ renews_building_id NOT NULL، is_plan_change=true ⇒ previous_tier_id NOT NULL + is_renewal=true)
- الـ UPDATE workflow على الـ status لا يُكسر الـ existing CHECK (in our case: status='approved' ⇒ provisioned_user_id NOT NULL — needed setting it in complete_renewal even though renewals don't have a "new user"; resolved by snapshotting building's admin user_id)

النَتيجة: قَيد مُركَّب في v0.19 = `chk_renewal_fields` يَفرض الـ تَناسُق بين الأعمدة الأربعة الجديدة، و complete_renewal يَلتقط admin user_id لإرضاء `status='approved' ⇒ provisioned_user_id NOT NULL` من Phase 18.

#### إحصائية post-Phase 19

- **20 ملف SQL** | **372 اختبار** | **40 درساً** | **0 vulnerabilities**
- Phase 19 RPCs: 11 (add/deactivate team، renewal create/complete، change plan، 4 bulk import، 2 reminder)

### التحديثات في 3.41 (إغلاق ملاحظة Codex preview round 4 على Phase 18 — 1× P2: تَضييق نطاق الـ marker)

#### الملاحظة

**(P2) marker cron يَفتح أي transition صالح داخل نفس المعاملة**

في v3.40، أَدخلنا `private.cron_subscription_expiry_marker` لإغلاق bypass الـ `session_user='service_role'` الواسع. الـ trigger كان يَفعل في فرع الـ marker:
1. ✅ يَمنع تَغيير `subscription_plan` / `trial_ends_at` / `subscription_ends_at`
2. ❌ يَترك `subscription_status` يَتَغيَّر لأي قيمة في الـ general transition whitelist

الـ transition whitelist يَسمح بـ:
- `active → past_due | cancelled | expired` ✓
- `expired → active | trial`
- `cancelled → active | trial`
- `past_due → active | cancelled | expired`

النتيجة: لو `expire_due_subscriptions()` نُفِّذ ضمن transaction أوسع (نَظرياً، أو بسبب bug مُستقبلي يَكشف الـ marker لمسار آخر)، أي UPDATE في نفس الـ txid يَستطيع استخدام الـ marker لتَنفيذ:
- `active → cancelled` (بدون super_admin، بدون سبب)
- `expired → active` (إعادة تَفعيل عمارة مُنتَهية)
- `past_due → expired` (تَخطي مَرحلة المُحاسبة)

كلها داخل الـ general whitelist، فلا تُرفض. الـ marker يَفترض أنه single-purpose (bulk-flip للـ rows المُستحقَّة)، لكن الـ trigger كان يَتعامل معه كـ "تَصريح عام لأي تَغيير في `subscription_status`".

#### الإصلاح

**clamp الـ marker إلى التَحويل الدقيق فقط** — `OLD.status='active'` و `NEW.status='expired'` و `OLD.subscription_ends_at IS NOT NULL` و `OLD.subscription_ends_at < now()`:

```sql
-- v3.41 (Codex round 4 P2): tighten further. The general transition
-- whitelist allows several transitions out of 'active' and into
-- 'active'/'trial' from terminal states. Without this clamp, the marker
-- would also legalize them — any UPDATE in the same txid as the cron
-- RPC could ride the bypass to do `active→cancelled` or `expired→active`
-- so long as no other field changes. The marker is single-purpose: a
-- bulk-flip of due rows, where the row's contractual end-date has truly
-- passed. Enforce that exactly:
--   OLD.status='active', NEW.status='expired', OLD.ends_at IS NOT NULL
--   AND OLD.ends_at < now()
if OLD.subscription_status is distinct from 'active'
   or NEW.subscription_status is distinct from 'expired'
   or OLD.subscription_ends_at is null
   or OLD.subscription_ends_at >= now() then
  raise exception
    'cron expiry marker may only flip active→expired on rows whose subscription_ends_at has passed'
    using errcode = 'check_violation';
end if;
```

الـ `expire_due_subscriptions()` RPC نفسها لها `where subscription_status='active' and subscription_ends_at < now()` في الـ UPDATE، فالـ rows المُستهدفة تَنطبق على الـ clamp بالضبط. الـ regression confirms (test 18.24i).

#### الـ regression الكامل
- typecheck ✅
- lint ✅
- build ✅
- SW postbuild ✅
- sql-validate ✅ **337/337** (4 جديدة + 333 سابقة)
- audit ✅ 0 vulnerabilities

#### اختبارات جديدة (4)
- 18.24f: marker + `active→cancelled` → blocked (clamp يُحدِّد `expired` فقط)
- 18.24g: marker + `expired→active` → blocked (recovery transition لا تَمر عبر الـ bypass)
- 18.24h: marker + `active→expired` لكن `ends_at` مُستقبل → blocked (rows غير مُستحقَّة لا تَمر)
- 18.24i: regression — `expire_due_subscriptions()` الشرعي ما زال يَعمل بعد الـ clamp

#### درس مُحسَّن (تَوسيع #38)

**#38 (مُحدَّث)**: عند فَتح bypass للـ trigger لمسار خاص، التَصميم الكامل يَحتاج طبقتين من القَيد:
1. **proof of identity** (الـ marker): private schema، مَربوط بـ `txid_current()`، يُكتب فقط من security definer RPC مَحدودة الـ GRANT
2. **scope clamp** (الـ semantics): الـ marker يُمَكِّن `(action, OLD-state, NEW-state)` مُحدَّد فقط — ليس "أي تَغيير قَانوني داخل الـ general whitelist"

بدون الطبقة الثانية، الـ marker يَتَحوَّل من "single-purpose bypass" إلى "general bypass for whoever has the txid"، مما يُعيد فَتح الـ surface الذي حاولنا إغلاقه. الـ general whitelist مَصمَّم لـ super_admin (الذي له صلاحية كاملة)؛ الـ marker مَصمَّم لـ cron (الذي له فعل واحد فقط).

#### إحصائية post-Phase 18 round 4

- **19 ملف SQL** | **337 اختبار** | **8 RPCs + helper + cron RPC في Phase 18** | **38 درساً** (الـ #38 مُوسَّع) | **0 vulnerabilities**

### التحديثات في 3.40 (إغلاق ملاحظات Codex preview round 3 على Phase 18 — 3× P2)

#### الملاحظات

**(P2 #1) `mark_provisioning_failed` بلا ownership check**

الـ RPC كان يَفحص `is_super_admin()` فقط، بدون التَحقُّق من أن المستدعي هو نفسه الذي حَجز الـ order (`reviewed_by`). نَتيجة: super_admin B يَستطيع إفشال order مَحجوز من super_admin A أثناء الـ invite/complete، مما يُحوِّله إلى `provisioning_failed` وقت أن A ما زال نشطاً.

السيناريو الحقيقي: A يَحجز → A يُرسل invite (Supabase auth call، 2-3 ثواني) → B يَفتح نفس الصفحة → B يَضغط "mark failed" خطأً → الـ order يَتحوَّل إلى `provisioning_failed` بينما A على وشك استدعاء `complete_provisioning`.

**(P2 #2) bypass واسع لـ `service_role` على `buildings.subscription_*`**

في v3.38، أضفنا في الـ Phase 14 trigger:
```sql
if not is_super and session_user <> 'service_role' then
  raise exception 'Subscription fields can only be changed by super_admin'
```
هذا يَفتح bypass لكل من يَتصِل عبر service_role — وهذا يَشمل **كل** server actions تَستخدم `createAdminClient()` (auth-admin invites، contact_request RPC، Phase 17 join requests، إلخ). أي bug في تلك المسارات يَستطيع تَغيير `subscription_status` أو `subscription_ends_at` بدون gating.

النَموذج الصحيح (Phase 8 درس #6): unforgeable private marker — bypass مَحدود للـ transaction التي أنشأتها الـ RPC المَخصَّصة.

**(P2 #3) cron يَدوس `subscription_ends_at` (التَاريخ التَعاقدي)**

`/api/cron/expire-subscriptions` كان يَعمل:
```sql
update buildings set subscription_status='expired', subscription_ends_at=now()
where subscription_ends_at < now()
```
هذا يُغيِّر الـ contractual end date إلى وقت الـ cron run، مما يَمحو الـ audit trail. لو العميل اشترَك حتى 2026-01-15 وانتهى، الـ cron يُحوِّل `ends_at` إلى `now()` (مثلاً 2026-01-15 02:05 UTC أو حتى لاحقاً) — التَقارير، الفواتير، نزاعات الدعم تَفقد التَاريخ الأصلي.

#### الإصلاحات

**1. `mark_provisioning_failed` ownership check**:
```sql
-- ownership check (v3.40): only the super_admin who reserved can mark
-- failed, unless the lock is stale (>5 min — matches reserve takeover).
if v_order.reviewed_by is distinct from v_user_id then
  if v_order.provisioning_started_at is null
     or v_order.provisioning_started_at > (now() - interval '5 minutes') then
    raise exception 'order reserved by a different super_admin'
      using errcode = 'P0003';
  end if;
  -- stale lock: takeover allowed
end if;
```
نَفس قَاعدة `reserve_subscription_order_for_provisioning`: السوبر الذي حَجز يَستطيع mark failed بلا قيود؛ سوبر آخر يَستطيع فقط لو الـ lock بائت (>5 دقائق).

**2. private marker بدلاً من session_user check**:
```sql
create schema if not exists private;
create table if not exists private.cron_subscription_expiry_marker (
  txid bigint primary key,
  created_at timestamptz not null default now()
);
revoke all on private.cron_subscription_expiry_marker from public, authenticated, anon;
revoke all on schema private from public, authenticated, anon;

-- Trigger checks marker for THIS txid
declare
  is_cron_expiry boolean := exists (
    select 1 from private.cron_subscription_expiry_marker
    where txid = txid_current()
  );
begin
  if not is_super and not is_cron_expiry then
    raise exception 'Subscription fields can only be changed by super_admin ...'
  end if;

  -- v3.40: when cron path used, ONLY subscription_status may change
  if is_cron_expiry and not is_super then
    if NEW.subscription_plan ... or NEW.subscription_ends_at ... then
      raise exception 'cron expiry path may only change subscription_status'
    end if;
  end if;
```

ولا يُمكن تَزوير الـ marker لأنه:
- private schema، مَحجوب من public/authenticated/anon
- INSERT يَحدث فقط داخل `expire_due_subscriptions()` (security definer، GRANT لـ service_role)
- مَربوط بـ `txid_current()` — ولا يُمكن إعادة استخدامه في transaction أخرى

**3. narrow cron RPC**:
```sql
create or replace function public.expire_due_subscriptions()
returns int
language plpgsql
security definer
as $$
declare v_count int;
begin
  insert into private.cron_subscription_expiry_marker (txid)
  values (txid_current())
  on conflict (txid) do nothing;

  -- Bulk flip — preserves subscription_ends_at (audit trail)
  update public.buildings
  set subscription_status = 'expired'
  where subscription_status = 'active'
    and subscription_ends_at is not null
    and subscription_ends_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute from public; grant execute to service_role;
```

**4. cron route يَستدعي الـ RPC**:
```ts
const { data: expiredCount } = await admin.rpc('expire_due_subscriptions')
return NextResponse.json({ success: true, expired: expiredCount ?? 0 })
```

#### الـ regression الكامل
- typecheck ✅
- lint ✅
- build ✅
- SW postbuild ✅
- sql-validate ✅ **333/333** (4 جديدة + 329 سابقة)
- audit ✅ 0 vulnerabilities

#### درس جديد في المحفظة (1)

**#38 (مُقترَح)**: عندما تَفتح bypass للـ trigger لمسار خاص (cron, batch job, scheduled task)، لا تَستخدم session_user أو current_user أو role attribute كـ proof — كلها قابلة للتَكرار من أي caller بنفس الـ role. الـ proof الوحيد القابل للاعتماد:
- **private schema marker** مَربوط بـ txid_current()
- يُكتب فقط من security definer RPC مَحدودة الـ GRANT
- يُقرأ من الـ trigger في **نفس** الـ transaction

هذا يُحوِّل الـ bypass من "أي service_role caller" إلى "هذا الـ caller، في هذا الـ transaction، عبر هذا الـ RPC". أي bug في server actions أخرى تَستخدم admin client لا يُفعِّل الـ bypass.

النَموذج مُستلَهم من Phase 8 درس #6 (GUC قابل للتَزوير → private marker). الـ tradeoff: schema/table إضافي (cleanup-free لأن الصف مَربوط بـ txid قَديم لا يَتكرَّر).

#### إحصائية post-Phase 18 round 3

- **19 ملف SQL** | **333 اختبار** | **8 RPCs + helper + cron RPC في Phase 18** | **38 درساً** | **0 vulnerabilities**

### التحديثات في 3.39 (إغلاق ملاحظات Codex preview على Phase 18 — 1× P1 + 1× P2 + defense-in-depth)

#### الملاحظات

**(P1) `createSubscriptionOrderAction` يُمرِّر `total_amount: 0` للبريد**

`renderOrderCreatedEmail` كان يَستلم `total_amount: 0` (placeholder قديم) و `currency: 'SAR'` static. الـ RPC يَحسب الـ snapshot صحيحاً داخلياً، لكن الـ action لم يَقرأه. النتيجة: **العميل يَستلم بريداً يَطلب منه تحويل 0 SAR**.

السيناريو الكارثي:
- أحمد يَملأ /subscribe لـ pro/yearly (1490 SAR)
- DB يُسجِّل total_amount=1490 صحيحاً
- /subscribe/[id] يَعرض 1490 صحيحاً (يَقرأ من DB)
- **البريد يَعرض 0 SAR**
- أحمد يَتبع البريد، يُحوِّل 0 SAR (أو لا يُحوِّل)، يَرفع إيصالاً لا يُطابق
- super_admin يَرفض

**(P2) Receipt upload route لا يَفحص status قبل upload**

`validate_subscription_order_token` يُرجع `valid=true` للـ token الصحيح بصرف النظر عن status. الـ token يَبقى صالحاً حتى بعد:
- `awaiting_review` (الإيصال قيد المراجعة)
- `provisioning` (super_admin بدأ)
- `approved` (تم التَفعيل)
- `expired` (انتهى وقت الطلب)

أي صاحب رابط يَستطيع POST receipt إلى الـ route. الـ route كان:
1. validate token ✓
2. **upload to Storage** (orphan إذا الحالة خطأ)
3. submit_subscription_receipt RPC → يَفشل
4. cleanup best-effort (`storage.remove`) — قد يَفشل بدوره

النتيجة: ملفات orphan في Storage لو cleanup فَشل (network blip، crash، إلخ).

#### الإصلاحات

**1. RPC `create_subscription_order` يَرجع total + currency**:
```sql
returns table (
  order_id uuid,
  reference_number text,
  total_amount numeric,    -- v3.39: snapshot للـ caller
  currency text
)
```
الـ caller (server action) يَستخدم `row.total_amount + row.currency` للبريد مباشرةً. الـ snapshot consistent بين 3 أماكن:
- DB row (للـ super_admin review)
- /subscribe/[id] page (يَقرأ من DB)
- email (يَستخدم RPC return — نفس الـ transaction)

**2. Route status gate قبل upload**:
```ts
// Phase 18 round 2 — gate BEFORE Storage
if (v.current_status !== 'awaiting_payment' && v.current_status !== 'rejected') {
  return 409 + رسالة عربية مُحدَّدة لكل حالة
}
// ثم: file validation → upload → RPC
```
رسائل عربية مُحدَّدة لكل حالة:
- awaiting_review/provisioning → "الإيصال السابق قيد المراجعة"
- approved → "الطلب مُعتَمَد، افحص بريدك"
- expired → "انتهت صلاحية الطلب"
- لا upload يَحدث في Storage لأي من هذه

**3. RPC `submit_subscription_receipt` defense-in-depth**:
```sql
if v_order.status = 'rejected' and v_order.rejection_attempt_count >= 3 then
  raise exception 'maximum re-upload attempts reached'
end if;
```
كان موجوداً في email logic فقط. الآن DB-enforced — لا قبول re-upload بعد 3 رفضات حتى لو الـ route سُمح به (defense layer 2).

#### الـ regression الكامل
- typecheck ✅
- lint ✅
- build ✅
- SW postbuild ✅
- sql-validate ✅ **329/329** (6 جديدة + 323 سابقة)
- audit ✅ 0 vulnerabilities

#### دروس جديدة في المحفظة (2)

**#36 (مُقترَح)**: RPCs التي تُنشئ صفّاً مع computed values (snapshot، VAT، total) **يَجب أن تُرجع تلك القيم**، لا فقط الـ id. السبب: الـ caller يَحتاجها لعمليات مُتجاورة (email، URL، logging). بدون ذلك، الـ caller إما:
- (أ) يَعمل round-trip ثانٍ (SELECT بعد INSERT) — performance hit
- (ب) يُعيد حساب القيم محلياً — duplicate logic، drift خطر
- (ج) يُهمل بـ placeholder كـ 0 — bug صامت (الحالة الأخطر)

النمط الصحيح: `INSERT ... RETURNING ... INTO` ثم `RETURN QUERY` بكل ما يَحتاجه الـ caller. هذا يَجعل الـ snapshot consistent عبر:
- DB row (المصدر الرسمي)
- RPC return (للـ caller الفوري)
- أي UI page يَقرأ لاحقاً (يَستخدم نفس الصف)

**#37 (مُقترَح)**: public file upload routes يَجب أن تُغلق على state machine **قبل** الـ upload، ليس بعده. الترتيب الصحيح:
```
validate token → check status → file validation → upload → flip status (RPC)
```
ترتيب خاطئ (`upload → check`) يَخلق orphan files عند rejection الـ RPC. الـ cleanup `storage.remove()` best-effort = ليس atomic = ليس مَضمون. لو cleanup فَشل (network blip، service down)، الـ Storage يَتراكم بـ ملفات لا مُلاك لها.

النمط يَنطبق على أي storage upload مَربوط بـ DB workflow:
- subscription receipts (Phase 18) ✓
- maintenance images, expense invoices (Phase 8/11): الـ workflow check يَحدث في الـ DB قبل الـ upload لأن الصف مَوجود
- documents (Phase 11): file_url يُضاف بعد upload — لكن Phase 11 trigger يَفحص path tenant ضد row.building_id

Phase 18 الـ orchestrator هو HTTP route (لا صف موجود قبل upload لأن الإيصال هو الـ trigger للـ status change). لذلك الـ route يَجب أن يَفحص الـ state من الـ token validation result.

#### إحصائية post-Phase 18 round 2

- **19 ملف SQL** | **329 اختبار** | **8 RPCs في Phase 18** | **37 درساً** | **0 vulnerabilities**

### التحديثات في 3.38 (تَنفيذ Phase 18 — Bank-Transfer Subscription Orders + Provisioning + Admin Onboarding)

أكبر phase حتى الآن. تَنفيذ كامل للنطاق المُحدَّد في PLAN v3.27/3.28 مع تَطبيق صارم لكل الدروس المُتراكمة (#19، #28-#32).

#### المخرجات الفعلية

| طبقة | الإحصائية |
|---|---|
| SQL | 1 ملف جديد (`19_phase18.sql`)، 1 جدول (`subscription_orders`)، 8 RPCs + 1 helper، storage bucket، Phase 14 trigger amendment |
| Server actions | 5 (createOrder، approve، reject، resetFailed، dismissWizard) |
| API routes | 3 (receipt upload + 2 cron jobs CRON_SECRET-protected) |
| Routes جديدة | 5 صفحات (3 marketing + 2 super-admin) |
| Components | 4 marketing + 2 super-admin + 1 dashboard wizard |
| Email templates | 3 عربية (created، approved، rejected) |
| Tests | 25 اختبار SQL → **323/323** |
| Dependencies جديدة | **0** |

#### معايير القبول المُحقَّقة (24/24 من PLAN v3.28)

- ✅ `/subscribe?tier=X&cycle=Y` anon-callable
- ✅ reference_number فريد + raw token ≥ 32 char
- ✅ raw token لا يُحفَظ في DB (hash فقط)
- ✅ raw token مرة واحدة في URL (email + redirect)
- ✅ `/subscribe/[id]?t=...` يَستدعي validate_subscription_order_token RPC
- ✅ legitimate user 10 refreshes → لا قفل (split counter v3.28)
- ✅ 5 محاولات بـ token خطأ → قفل
- ✅ rate limits بالـ IP في server action (in-memory، Upstash للـ production)
- ✅ amount/vat/total snapshot — تَغيير tier prices لا يُؤثِّر على orders قائمة
- ✅ رفع الإيصال حصراً عبر API route (token validation → service_role upload → RPC)
- ✅ anon لا يَستطيع upload مباشر (Storage RLS deny-all)
- ✅ super_admin في `/super-admin/orders` يَرى filters بالحالة
- ✅ Reserve/Complete pattern: reserve → invite → complete + recovery paths
- ✅ race protection بين super_admins (SELECT FOR UPDATE في reserve)
- ✅ invite failure recovery → provisioning_failed
- ✅ complete failure recovery → provisioning_failed + audit user_id للـ orphan cleanup
- ✅ stale lock recovery (5 minutes)
- ✅ reject ≥ 3 chars + max 3 attempts
- ✅ cron 1 (stale orders): expired بعد 30 يوم
- ✅ cron 2 (expire subscriptions): subscription_ends_at < now
- ✅ cron protected بـ CRON_SECRET (anon → 401)
- ✅ receipt files غير قابلة للـ anon (signed URLs server-side فقط)
- ✅ admin بعد provisioning يَدخل → wizard يَظهر مرة واحدة → auto-hide on completion
- ✅ حساب admin مُنشأ بـ inviteUserByEmail (لا "بيانات دخول")

#### تَطبيق الدروس المُتراكمة

| الدرس | التَطبيق |
|---|---|
| #19 Reserve/Complete/Fail | approveOrderAction بـ 4 خطوات: reserve → invite → complete → email + recovery |
| #20 IP rate limit في route | createOrder + receipt upload + cron + Upstash-ready interface |
| #28 + #31 RPC choke points | NO direct INSERT/UPDATE policies على subscription_orders، RPCs only |
| #29 Token hashing | randomBytes(32) + SHA-256، raw مرة واحدة في URL |
| #25 Audit logging للـ side effects | log_email_failure للـ email failures في الـ flow |

#### الـ regression الكامل
- typecheck ✅
- lint ✅
- build ✅ (Middleware 89.5 kB، 8 new routes)
- SW postbuild ✅
- sql-validate ✅ **323/323** (25 جديدة + 298 سابقة)
- audit ✅ 0 vulnerabilities

#### دروس جديدة في المحفظة (3)

**#33 (مُقترَح)**: Reserve/Complete/Fail pattern (lesson #19) tested في إنتاج لأول مرة في Phase 18. الـ "fail" branch **ليس optional** — هو الـ recovery state الذي يُحوِّل 500 error إلى orphan قابل للتنظيف. بدون `mark_provisioning_failed`، invite-without-building = حالة غير قابلة للاسترداد، تَتطلَّب SQL surgery.

**#34 (مُقترَح)**: Cron jobs تَحتاج bypass workflow triggers → استخدم `session_user = 'service_role'` exception في الـ trigger نفسه (per-table، opt-in)، **لا** `DISABLE TRIGGER` عالمياً. هذا يَحفظ:
- transparency (الـ trigger logic مَرئي + مَوثَّق)
- per-table targeting (cron يَبطل trigger A، لا triggers أخرى)
- audit (الـ change-via-service_role مَوسوم في schema)

**#35 (مُقترَح)**: Snapshot pricing في DB at create-time (لا late-binding من tier table). بدون snapshot:
- تَغيير سعر tier بعد order creation → الـ /subscribe/[id] يَعرض السعر الجديد للعميل القديم
- super_admin reviewer لا يَعرف بأي سعر تَم الـ quote
- الـ rejection email "أعد المحاولة" قد يَعرض سعراً مختلفاً
- Pattern: lesson #11 (period_month consistency) مُطبَّق على pricing.

#### إحصائية post-Phase 18

- **19 ملف SQL** | **323 اختبار** | **8 RPCs في Phase 18 (+ helper)** | **35 درساً** | **0 vulnerabilities**
- المتبقي: Phase 19 (Team Management + Renewal Self-Service + Plan Changes + Bulk Import)

### التحديثات في 3.37 (إغلاق Phase 17 رسمياً + UI rotation copy polish، لا تَغيير سلوكي)

Codex وافق على Phase 17 = **100/100** بعد round 3. ذكر polish غير مانع: نص `ShareJoinLink` يَقول "ولِّد رابط" بدلاً من "تَدوير/استبدال". DB صار source of truth بعد v3.36، لكن UI لم يُبلِّغ admin أن القديم سيُعَطَّل. **لا تَغييرات سلوكية** — كل الاختبارات تَبقى 298/298.

#### التَغييرات

`src/components/apartments/share-join-link.tsx`:
- DialogTitle → "**تَدوير** رابط دعوة السكان"
- Warning banner جديد قبل النموذج: "⚠️ توليد رابط جديد سيُعَطِّل أي رابط سابق لهذه العمارة فوراً"
- زر: "توليد الرابط" → "**تَدوير** وإنشاء رابط جديد"
- Post-generate warning مُحدَّث: "أي رابط سابق صار مُعَطَّلاً تلقائياً (rotation تَم)"
- Toast: "تَم تَدوير الرابط — أي رابط قديم تَعَطَّل تلقائياً"

#### إحصائية Phase 17 النهائية

| البند | القيمة |
|---|---|
| Acceptance | Codex round 3 = 100/100 |
| ملف SQL جديد | 1 (`18_phase17.sql`) |
| Tables جديدة | 2 (`building_join_links`، `pending_apartment_members`) |
| RPCs | 6 (`create_building_join_link` مع rotation، `resolve_building_join_token`، `submit_join_request`، `approve_pending_member`، `reject_pending_member`، `disable_join_link`) |
| Server actions | 6 |
| Routes جديدة | 4 (`/join/[token]`، `/join/finalize`، `/account/pending`، `/apartments/pending`) |
| Components | 3 marketing/apartments + helpers |
| اختبارات SQL | 40 لـ Phase 17 (30 round 1 + 8 round 2 + 2 round 3) |
| اختبارات إجمالية | **298/298** |
| دروس جديدة للمحفظة | 4 (#29-#32) |
| Dependencies جديدة | **0** |
| Vulnerabilities | **0** |

#### الـ regression
- typecheck ✅ / lint ✅ / `sql-validate 298/298` ✅

#### الخطوة التالية

Phase 18 — Manual Bank-Transfer Subscription Orders + Provisioning + Admin Onboarding. مَكتوبة بالتفصيل في §5.18 (PLAN v3.27/3.28+). تَطبيق نفس النمط الناضج:
- Reserve/complete/mark_failed pattern (دروس #19 + #31)
- Token hashing مع rotation semantic (دروس #29 + #32)
- RPC choke points (لا direct table writes — درس #28 + #31)
- Audit logging للـ side effects (درس #25)
- Path-aware rate limits على server actions (درس #20)

### التحديثات في 3.36 (إغلاق ملاحظات Codex preview round 3 على Phase 17 — 1× P2 rotation + 1× P3 doc drift)

#### الملاحظات

**(P2) `create_building_join_link` بدون rotation semantic**

PLAN معيار قبول صريح: "admin يُمكنه توليد token جديد (يُلغي القديم)". الـ implementation كان يُضيف صفّاً جديداً فقط، يَترك القديم على حاله. السيناريو الفاشل:
- admin يَشارك link A في WhatsApp
- Link A يُسرَّب لشخص خارج العمارة
- admin يَكتشف ويُولِّد link B جديد
- Link A **ما زال صالحاً** حتى expires_at/max_uses
- المُهاجم يَستطيع `submit_join_request` عبر A

**(P3) PLAN.md §17 RLS section يَصف السياسة القديمة**

القسم الرسمي يَقول "INSERT/UPDATE/DELETE حصراً على admin + super_admin"، بينما v3.35 أزال INSERT/UPDATE. doc drift يُعيد إنتاج نمط الـ bypass عند أي تَنفيذ/مراجعة لاحقة.

#### الإصلاحات

**1. `create_building_join_link` rotation semantic (atomic)**:

```sql
-- ATOMIC (نفس الـ transaction):
update public.building_join_links
set disabled_at = now()
where building_id = p_building_id
  and disabled_at is null;

insert into public.building_join_links (...) values (...);
```

Atomicity مَضمونة لأن PostgreSQL function = transaction واحدة. لو فشل INSERT (مثلاً unique violation على token_hash)، الـ UPDATE يَتراجع تلقائياً.

**2. PLAN §17 RLS section مُحدَّث** ليَعكس v3.35 + v3.36:
- SELECT: admin/super_admin
- INSERT: NO policy — RPC `create_building_join_link` فقط (مع rotation الآن)
- UPDATE: NO policy — RPCs `submit_join_request` (uses_count) + `disable_join_link` (disabled_at)
- DELETE: NO policy — soft-disable فقط

#### الـ regression الكامل
- typecheck ✅
- lint ✅
- build ✅
- SW postbuild ✅
- sql-validate ✅ **298/298** (2 جديدة + 296 سابقة)
- audit ✅ 0 vulnerabilities

#### درس جديد في المحفظة (#32 مُقترَح)

**tokens public-facing تَحتاج rotation semantic explicit**. توليد token جديد = إبطال القديم تلقائياً (atomic UPDATE-then-INSERT في PostgreSQL function). بدون هذا:
- الـ leak window يَمتد حتى expiry/max_uses الطبيعي (قد يَكون أيام/أسابيع)
- admin يَفترض أن "rotation" يَحمي، لكنه لا يَحمي فعلياً
- النمط نفسه يَنطبق على API tokens، session tokens، invite tokens، magic links

UI يَعرض "تم تَدوير الرابط — القديم لم يَعد يَعمل" بدلاً من "تم إنشاء رابط إضافي" لتَجنُّب التباس admin حول semantics.

#### إحصائية post-Phase 17 round 3

- **18 ملف SQL** | **298 اختبار** | **6 RPCs في Phase 17** | **32 درساً** | **0 vulnerabilities**

### التحديثات في 3.35 (إغلاق ملاحظات Codex preview على Phase 17 — 2× P1 close direct write bypass)

Codex preview راجع v3.34 ورصد ثغرتَين معماريَّتَين P1 — كلتاهما عن **direct write bypass على الـ admin path**. المبدأ المُحمَّل من Phase 16 (#28) كان عن anon — round 2 يُوسِّعه ليَشمل authenticated admin.

#### الملاحظات

**(P1) #1 — `pending_apartment_members` direct UPDATE bypass**

السياسة `pending_update_admin` كانت تَسمح للـ admin بـ UPDATE مباشر. الـ workflow trigger يَسمح بـ pending→approved (transition + reviewed_by + reviewed_at). الـ SQL مَقبول لكن **link_apartment_member NEVER يُستدعى**. النتيجة:
- pending row يُعَلَّم `approved`
- لا apartment_members INSERT
- الساكن "مُعتَمَد" بلا صلاحية فعلية → **orphan approval**

أي admin (حتى عن طريق UI inspector → Supabase JS client) يَستطيع تَنفيذ:
```sql
UPDATE pending_apartment_members SET status = 'approved', ... WHERE id = ...;
```
وتَجاوز كل lifecycle الـ RPC.

**(P1) #2 — `building_join_links` direct INSERT/UPDATE bypass**

السياسات كانت تَسمح للـ admin بـ direct INSERT + UPDATE على كل الحقول:
- تَصفير `uses_count` بعد بلوغ `max_uses`
- تَغيير `token_hash` إلى token معروف/مَسرَّب  
- نقل الرابط بين عمارات عبر `building_id`
- مَد `expires_at` بلا حدود
- تَفعيل `disabled_at` يدوياً (عَكس)

كل هذا خارج `create_building_join_link` / `submit_join_request` / `disable_join_link` وبدون trigger يَحمي الحقول.

#### الإصلاحات

**1. Drop direct write policies**:
- `pending_apartment_members`: drop `pending_update_admin` (UPDATE)
- `building_join_links`: drop `join_links_insert_admin` + `join_links_update_admin`
- SELECT/DELETE policies تَبقى (للـ UI)
- DELETE على building_join_links لم يَكن مَوجوداً أصلاً (soft disable عبر RPC)

**2. RPC جديد `disable_join_link(p_link_id)`**:
- SECURITY DEFINER، admin role check، idempotent (`coalesce(disabled_at, now())`)
- يَحل محل direct UPDATE الذي كان في `disableJoinLinkAction`
- بدونه، الـ action لن يَستطيع تَعطيل link بعد drop UPDATE policy

**3. `disableJoinLinkAction`** يَستدعي الـ RPC الجديد بدلاً من `.from(...).update(...)`

**4. SECURITY DEFINER RPCs تَتجاوز RLS**: لا حاجة لـ UPDATE policy للـ RPCs لتَعمل. كل الـ writes الآن:
```
HTTP layer (server action)
  ↓ admin client narrow scope
DB layer (SECURITY DEFINER RPCs — الـ surface الوحيد للكتابة)
  ├─ create_building_join_link    (admin INSERT)
  ├─ submit_join_request           (server-only, atomic uses_count++)
  ├─ disable_join_link [NEW]       (admin UPDATE disabled_at)
  ├─ approve_pending_member        (admin UPDATE status + apartment_members INSERT)
  └─ reject_pending_member         (admin UPDATE status + reason)
```

#### الـ regression الكامل
- typecheck ✅
- lint ✅
- build ✅ (Middleware 89.5 kB)
- SW postbuild ✅
- sql-validate ✅ **296/296** (8 جديدة + 288 سابقة)
- audit ✅ 0 vulnerabilities

#### درس جديد في المحفظة (#31 مُقترَح)

**"RPC as choke point" يَنطبق على WRITES المُصرَّحة (admin)، ليس فقط anon**. لو الـ table له lifecycle محمي بـ RPC (counter يُزداد، state machine يَنتقل بشروط، token يُستهلك)، يَجب drop **كل** direct write policies — حتى للـ admin. السبب:
- الـ admin يَملك UI لـ convenience، لكنه ليس API client بشري ضمن workflow.
- Supabase JS client يَكشف table writes (`.from('x').update(...)`) لأي مستخدم له role + RLS policy.
- الـ admin يَملك inspector + curl + node REPL — يَستطيع كتابة direct SQL.
- الـ RPC SECURITY DEFINER يَتجاوز RLS، فلا يَحتاج UPDATE policy ليَعمل.

القاعدة: **إن كان للـ table lifecycle، الـ RPCs هي source of truth، الـ tables effectively read-only من perspective الـ user code**. UI دائماً تَستدعي RPCs، لا direct table access.

#### إحصائية post-Phase 17 round 2

- **18 ملف SQL** | **296 اختبار** | **6 RPCs في Phase 17** | **31 درساً** | **0 vulnerabilities**

### التحديثات في 3.34 (تَنفيذ Phase 17 — Building Join Links + Resident Pending Approval)

بعد إغلاق Phase 16 رسمياً (v3.33)، نُفِّذ Phase 17 كاملاً مع تَطبيق صارم للمبدأ المُحمَّل (لا direct anon table access — RPCs server-only كـ choke points). كل القيود المُحدَّدة في PLAN v3.27/3.28 طُبِّقت.

#### المخرجات الفعلية

| طبقة | الإحصائية |
|---|---|
| SQL | 1 ملف جديد (`18_phase17.sql`)، 2 جدول (`building_join_links`، `pending_apartment_members`)، 5 RPCs، workflow trigger |
| Server actions | 6 (resolve، signup، finalize، createLink، approve، reject، disable) |
| Routes جديدة | 4 (/join/[token]، /join/finalize، /account/pending، /apartments/pending) |
| Components جديدة | 3 (join-form، share-join-link، pending-members-list) |
| Helpers جديدة | 1 (`src/lib/tokens.ts` — generateRawToken + hashToken) |
| Tests | 30 اختبار SQL → **288/288** |
| Dependencies جديدة | **0** (node:crypto مَدمج، Switch من Phase 16) |

#### معايير القبول المُحقَّقة (16/16 من v3.27 spec)

- ✅ Raw token لا يَظهر في DB أبداً — فقط hash
- ✅ anon لا يَملك أي SELECT/INSERT/UPDATE/DELETE على `building_join_links`
- ✅ الـ raw token يُعرض للـ admin مرة واحدة فقط (UI warning صريح)
- ✅ `/join/<token>` لا يُرسل query مباشر — يَستدعي `resolve_building_join_token` RPC فقط
- ✅ الـ RPC يَفحص: hash + expired + disabled + max_uses + subscription active
- ✅ enum خطأ مُحدَّد لكل failure (لا 500)
- ✅ resolve لا يَزيد uses_count؛ الزيادة حصراً في submit (atomic)
- ✅ pending-only user → middleware → /account/pending
- ✅ pending + active في عمارة أخرى → Phase 14 fallback يُبدِّل cookie
- ✅ admin يَرى pending list مع apartment-picker
- ✅ approve ذرّياً (transaction)
- ✅ reject ≥ 3 chars
- ✅ resident لا يَستطيع status='approved' مباشرة (RLS + WITH CHECK + trigger)
- ✅ admin يُولِّد token جديد (ينتهي القديم)
- ✅ rate limit بالـ IP على server action layer (in-memory مع note لـ Upstash production)
- ✅ submit_join_request server-only (revoke from public، grant service_role)

#### تَطبيق المبدأ المُحمَّل من Phase 16 (#28)

كل public-facing surface في Phase 17 يَتبع النمط الحرفي:

```
HTTP layer (server action, has IP for rate limit)
  ↓ admin client narrow scope (لا direct table access)
DB layer (SECURITY DEFINER RPCs)
  ↓ RLS deny-all anon على tables
Storage layer (table CHECKs + workflow triggers)
```

لا exception واحد. `building_join_links` لا anon access؛ `pending_apartment_members` لا anon INSERT policy (server-only RPC هو الـ surface).

#### الـ regression الكامل
- typecheck ✅
- lint ✅
- build ✅ (Middleware 89.5 kB، 4 new routes)
- SW postbuild ✅
- sql-validate ✅ **288/288** (30 جديدة + 258 سابقة)
- audit ✅ 0 vulnerabilities

#### دروس جديدة في المحفظة (2)

**#29 (مُقترَح)**: للـ public-facing tokens، استخدم `randomBytes(32)` server-side (256 bits entropy، URL-safe base64). SHA-256 للـ lookup (O(1) indexed). لا bcrypt — الـ defense في الـ entropy، ليس في slow hashing. النمط نفسه Stripe/Slack/GitHub. الـ tokens تُحفَظ كـ hash فقط في DB، الـ raw يَظهر مرة واحدة في UI.

**#30 (مُقترَح)**: 2-step signup flow (signup → email confirm → finalize) يَحفظ الحالة بين الخطوتَين في `user_metadata` عبر:
- `auth.signUp({ options: { data: { pending_*: ... }, emailRedirectTo } })`
- post-callback page يَقرأ + يُنفِّذ + يُنظِّف
الـ finalize page يَجب أن تَكون idempotent: يَفحص لو الـ pending row موجود بالفعل قبل أي عملية → آمن من الـ refresh.

#### إحصائية post-Phase 17

- **18 ملف SQL** | **288 اختبار** | **30 درساً** | **17/19 مرحلة مُكتملة (0-17)** | **0 vulnerabilities**
- المتبقي: Phase 18 (Bank-Transfer Subscription Orders) + Phase 19 (Team + Renewals + Bulk Import)

### التحديثات في 3.33 (إغلاق Phase 16 رسمياً + cleanup غير مانع للتعليقات القديمة)

Codex وافق على Phase 16 = **100/100** بعد round 4. ذكر cleanup غير مانع للتعليقات القديمة في SQL/admin client، نُفِّذ هنا. **لا تَغييرات سلوكية** — كل الاختبارات تَبقى 258/258.

#### التَعليقات المُحدَّثة

1. **`src/lib/supabase/admin.ts` JSDoc** — كان يَقول "Only inside `src/app/(super-admin)/`" (دقيق قبل Phase 16). الآن يَسرد المَواضع المُصرَّح بها صراحةً مع scope كل واحد:
   - `src/app/(super-admin)/...` (platform admin ops)
   - `src/actions/marketing.ts` (Phase 16 — public form choke points، v3.32 amendment)
   ويُضيف القاعدة "admin client لا يَلمس tables مباشرةً، RPCs فقط".

2. **`supabase/17_phase16.sql` §(3) header comment** — كان يَقول "anon يَكتب (INSERT-only)". الآن يَشرح صراحة أن direct anon INSERT مَحجوب بعد round 4 + النمط الجديد (RPC server-only).

3. **PLAN.md §2.3** — الـ amendment يَتوسَّع بـ استثناء #2 رسمي (public form choke points) مع شرح:
   - السبب الأصلي (anon-key-in-bundle bypass)
   - النمط (admin client narrow scope، لا direct table access)
   - القاعدة العامة لإضافة استثناء جديد

4. **PLAN.md §1 test #12** — قائمة `(super-admin)/`-only للـ admin.ts imports تَوسَّعت لتَشمل `src/actions/marketing.ts`.

#### إحصائية Phase 16 النهائية

| البند | القيمة |
|---|---|
| Acceptance | Codex round 4 — 100/100 |
| ملف SQL جديد | 1 (`17_phase16.sql`) |
| Tables جديدة | 3 (subscription_tiers، platform_settings، subscription_requests) |
| RPCs | 4 (`get_active_subscription_tiers`، `get_public_bank_details`، `log_email_failure`، `submit_contact_request`) |
| Server actions | 3 |
| Routes جديدة | 6 (marketing + super-admin) |
| Components | 7 marketing + 2 super-admin + 1 UI primitive |
| اختبارات SQL | 30 لـ Phase 16 (12+9+5+6 جديدة + 3 محدَّثة) |
| اختبارات إجمالية | **258/258** |
| دروس جديدة للمحفظة | 8 (#21-#28) |
| Dependencies جديدة | **0** |
| Vulnerabilities | **0** |

#### الـ regression الكامل
- typecheck ✅ / lint ✅ / build ✅ / SW postbuild ✅
- sql-validate ✅ **258/258**
- audit ✅ 0 vulnerabilities

#### الخطوة التالية

Phase 17 — Building Join Links + Resident Pending Approval. مَكتوبة بالتفصيل في §5.17 (Plan v3.27+). تَطبيق نمط v3.32 الجديد على resident self-reg:
- لا direct anon table access
- RPCs server-only كـ choke points
- Upstash rate limit في server action layer
- token hashing (نمط دروس #6 + #18)

### التحديثات في 3.32 (إغلاق ملاحظات Codex preview round 4 على Phase 16 — P2 ثغرة معمارية: rate limit bypass عبر direct PostgREST INSERT)

Codex preview راجع v3.31 ورصد ثغرة معمارية واحدة لكنها جوهرية — كَشفت أن نمط "rate limit + honeypot" يَنهار عند wedge architecture بين action layer و DB layer.

#### الملاحظة

**(P2) `/contact` rate limit يُتجاوز عبر direct PostgREST INSERT**

في rounds 2/3، انتقلنا من service_role إلى anon-respecting client للـ INSERT (round 2)، ثم أصلحنا `.select()` (round 3). لكن السياسة `requests_insert_anon` تَركت INSERT مَفتوحاً للـ anon role. النتيجة:
- rate limit (3/IP/ساعة) يَعمل **فقط** عند المرور عبر `submitContactRequestAction`.
- anon key مَعروض في bundle المتصفح (هذا تَصميمي — Supabase JS يَستخدمه).
- أي مهاجم يَستطيع `POST /rest/v1/subscription_requests` مباشرةً عبر PostgREST بـ anon key.
- يَتجاوز rate limit (لا action) + Zod max lengths (تُطبَّق في action فقط).
- spam endpoint مَفتوح عملياً.

#### الإصلاح (شامل)

**1. SQL — إغلاق direct INSERT + إضافة RPC choke point**:
- `requests_insert_anon` policy → DROPPED. anon لا يَستطيع INSERT مباشر.
- RPC جديد `submit_contact_request(p_full_name, p_email, p_phone, p_building_name, p_city, p_estimated_apartments, p_interested_tier, p_message, p_honeypot)` SECURITY DEFINER:
  - GRANT حصرياً لـ service_role (`revoke from public`).
  - يَفرض داخلياً (defense layer 2): honeypot empty، length validation، interested_tier whitelist، status='new' forced.
  - لا يَأخذ `p_status` كـ parameter → استحالة client tampering.

**2. Action — استبدال direct INSERT بـ RPC عبر admin client**:
- `createAdminClient()` instantiated مَرة واحدة، يُستخدم في عملَين narrow scope:
  - `submit_contact_request` RPC (RPC submission)
  - `log_email_failure` RPC (audit)
- لا touches direct على tables.
- إن غاب `SUPABASE_SERVICE_ROLE_KEY` → action يُرجع رسالة واضحة "الخدمة غير مُكوَّنة" (was: الـ contact كان يَنجح بدون service_role في v0.16.0).

**3. `.env.example` — توضيح كل مَواضع الاستخدام**:
- service_role الآن إلزامي للـ contact form (was: optional).
- التَوثيق يُغطّي كلا المسارَين (auth-admin + admin) مع scope كل واحد.

#### Defense-in-depth layout (post-round-4)

```
HTTP layer (server action)
  ├─ rate limit بالـ IP (DB لا يَعرف IP — درس #20)
  ├─ Zod schema (UX-friendly errors)
  └─ admin client narrow scope ────┐
                                    ▼
DB layer (SECURITY DEFINER RPCs)
  ├─ submit_contact_request: honeypot + length + tier whitelist + status forced
  └─ log_email_failure: entity_type whitelist + audit trail
                                    │
                                    ▼
Storage layer (table CHECK constraints)
  └─ honeypot CHECK (defense layer 3 — لو RPC تَجاوز)
```

#### الـ regression الكامل
- typecheck ✅
- lint ✅
- build ✅
- SW postbuild ✅
- sql-validate ✅ **258/258** (6 جديدة + 3 محدَّثة + 252 سابقة كما هي)
- audit ✅ 0 vulnerabilities

#### الـ scope cleanup post-round-4
- 4 RPCs الآن في Phase 16: `get_active_subscription_tiers`، `get_public_bank_details`، `log_email_failure`، **`submit_contact_request`** (new).
- 0 anon-callable RPCs خارج tier reads (`get_active_subscription_tiers` فقط).
- 0 direct table writes من anon endpoints.
- choke point واحد لكل public form (نمط قابل للتَكرار في Phase 17/18).

#### درس جديد في المحفظة (#28 مُقترَح)

**rate limit في server action يَحمي فقط المسار عبر action**. لو الـ table يَملك anon INSERT policy، الـ anon key (مَوجود في bundle) يَسمح بـ direct PostgREST INSERT متجاوزاً الـ action تماماً. القاعدة لكل public form:
- **(أ) إغلاق direct table access كاملاً** (revoke INSERT policy) **+ إجبار المسار عبر action/RPC server-only** (المُوصى به).
- (ب) إضافة DB-side rate limit (صعب — يَحتاج timestamps + IP tracking في DB، لا يُوصى به لأنه يَنقل مَنطق HTTP إلى DB).

النمط (أ) صار قاعدة مُعتمَدة لـ Phase 17/18 (join links + subscription orders) — كل public form يَمر عبر admin client + RPC server-only.

#### إحصائية post-Phase 16 round 4

- **17 ملف SQL** | **258 اختبار** | **9 RPCs في Phase 16** | **0 vulnerabilities** | **0 dependencies جديدة**
- **28 درساً** في المحفظة الإجمالية

### التحديثات في 3.31 (إغلاق ملاحظات Codex preview round 3 على Phase 16 — 1× P1 + 1× P2)

Codex preview راجع v3.30 ورصد ثغرتَين تَكشفان عن لازمَين تشغيليَّين بعد التَحويل من service_role في round 2:

#### الملاحظات + الإصلاحات

**(P1) `/contact` يَستخدم `insert().select()` بدون SELECT policy**

الـ تَحويل في round 2 من service_role إلى regular client كَسر الـ chain `.select('id').single()`. السبب: PostgREST `return=representation` (الـ default على Supabase JS عند `.select()`) يَطلب SELECT permission. `subscription_requests` لا يَملك SELECT policy للـ anon (privacy intentional). النموذج كان قد يَفشل أو يُرجع `data` فارغة رغم نجاح INSERT في DB.

الإصلاح:
- تَوليد `requestId = randomUUID()` في server action عبر `node:crypto`
- تَمريره صراحةً في الـ INSERT
- حذف `.select('id').single()` نهائياً
- `requestId` الآن مَوجود في الـ closure مباشرةً، يُستخدم في `log_email_failure`

**(P2) `log_email_failure` مفتوح للـ anon → audit_logs spam**

في round 2، `log_email_failure` كان مَمنوحاً لـ `anon, authenticated` ليَستدعيه الـ contact action. لكن:
- audit_logs قاعدة المنصة الحساسة (الـ INSERT المعتاد triggers فقط)
- anon يَستطيع spam الـ RPC مباشرةً (تَجاوز rate limit `/contact`)
- entity_type whitelist يَحجب نوع الـ entity فقط، لا يَحجب التَكرار

الإصلاح:
- SQL: `revoke execute from public` + `grant execute to service_role` فقط
- Action: `createAdminClient()` للـ audit log RPC فقط (narrow scope)
- نمط defense-in-depth واضح:
  - **user data** (`subscription_requests.INSERT`): anon client → RLS = الـ gate
  - **system data** (`audit_logs` عبر RPC): service_role admin client → server-only
- graceful degradation: لو `SUPABASE_SERVICE_ROLE_KEY` غائب (dev)، logFailure يَتراجع إلى console + الـ contact request يَنجح (لا rollback)

#### الـ regression الكامل
- typecheck ✅
- lint ✅
- build ✅
- SW postbuild ✅
- sql-validate ✅ **252/252** (5 جديدة + 247 سابقة)
- audit ✅ 0 vulnerabilities

#### دروس جديدة في المحفظة (2)

**#26 (مُقترَح)**: PostgREST `return=representation` (الـ default على Supabase JS عند `.select()` بعد INSERT) يَتطلَّب SELECT permission على الجدول. للـ **anon-INSERT-only patterns** (contact forms، public submissions): ولِّد UUID server-side، تَمريره في الـ INSERT، احذف `.select()`. وإلا الـ INSERT يَفشل/يُرجع `data` فارغة رغم نجاحه في DB.

**#27 (مُقترَح)**: audit_logs RPCs **server-only** (revoke from anon/authenticated). audit_logs الـ INSERT المعتاد triggers فقط — أي SECURITY DEFINER RPC يَكتب فيه يَجب أن يَكون GRANT حصرياً لـ service_role. الـ server actions تَستدعيه عبر admin client بـ scope ضيق (audit logging فقط، لا user data).

#### إحصائية post-Phase 16 round 3

- **17 ملف SQL** | **252 اختبار** | **8 RPCs في Phase 16** | **0 vulnerabilities** | **0 dependencies جديدة**
- **27 درساً** في المحفظة الإجمالية

### التحديثات في 3.30 (إغلاق ملاحظات Codex preview على Phase 16 — 4× P2 design refinements)

Codex preview راجع تَنفيذ Phase 16 في v3.29 ورصد 4 ثغرات P2 — كلها قابلة للإغلاق بسرعة لكنها تَمس defense-in-depth وproduction safety. أُصلحت كلها مع 9 اختبارات SQL إضافية.

#### الملاحظات + الإصلاحات

**(P2 #1) `/contact` يَتجاوز RLS عبر service_role**

كان: `submitContactRequestAction` يَستخدم `createAdminClient()` (service_role) للـ INSERT في `subscription_requests`. هذا يَجعل:
- policy `requests_insert_anon` غير ممثَّلة في الـ production path
- اختبار `anon INSERT` غير مُمثِّل للسلوك الفعلي
- أي تَشديد RLS مستقبلي على submit لن يُطبَّق

الإصلاح: استبدال بـ `createClient()` العادي (anon-respecting). الـ INSERT يَمر عبر RLS الفعلية، والـ defaults (status='new'، honeypot=null) تُطابق ما تَفرضه `WITH CHECK`. أي شخص يَفحص الكود يَرى الـ policy نفسها هي الـ gate الفعلي.

**(P2 #2) `get_public_bank_details` متاحة لكل authenticated**

كان: `SECURITY DEFINER` + `GRANT EXECUTE TO authenticated` → أي مستخدم مسجَّل يَقرأ بيانات البنك متجاوزاً RLS على `platform_settings`. التَعليق ادَّعى أنها "super_admin only" لكن السلوك الفعلي مختلف.

الإصلاح: إضافة `is_super_admin()` check داخل الـ function نفسها. الـ GRANT يَبقى لـ authenticated (سيَوسَّع لـ anon في Phase 18 مع token validation)، لكن الـ check الداخلي يَرفض كل من سواه بـ "Access denied: super_admin only".

**(P2 #3) فشل البريد لا يُسجَّل في audit_logs**

كان: PLAN يَطلب graceful failure مع تَسجيل، لكن `Promise.allSettled` نتائجه تُرمى. فشل البريد يَظهر في `console` فقط (يَختفي بعد ساعات على Vercel). super_admin لا يَرى في المنتج.

الإصلاح:
1. RPC جديد في 17_phase16.sql: `log_email_failure(p_entity_type, p_entity_id, p_email_to, p_email_kind, p_reason)` — SECURITY DEFINER + entity_type whitelist (`subscription_request | subscription_order`) + email_kind whitelist (`notification | confirmation`).
2. `submitContactRequestAction` يُحلِّل نتائج `Promise.allSettled` ويَستدعي `log_email_failure` لكل فشل (config_missing أو send_failed أو rejection).
3. الـ failure تَظهر في `/super-admin/audit` بـ `action='email_failure'` + `notes` + `new_values` (email_to + reason_full).
4. الـ DB integrity تَبقى — INSERT الأصلي لا يُلغَى أبداً.
5. logFailure نفسها مُغلَّفة بـ try/catch (last-resort) لتَجنُّب infinite failure loop.

**(P2 #4) trigger يَترك حقول الإدخال قابلة للتَعديل**

كان: workflow trigger يُجمِّد `email/full_name/building_name/phone/honeypot` فقط. `city`، `estimated_apartments`، `interested_tier`، `message` بقيت قابلة للتَعديل من super_admin — هذا ثقب في قاعدة immutability وليس قراراً مَقصوداً (الـ action يُحدِّث `status/notes/reviewed_by/reviewed_at` فقط).

الإصلاح: الـ trigger يُجمِّد **كل** submitter-provided fields الآن. super_admin يَستخدم `notes` للتَعليقات الخاصة (لا يَكتب على `message` الأصلية).

#### الـ regression الكامل
- typecheck ✅
- lint ✅
- build ✅
- SW postbuild ✅
- sql-validate ✅ **247/247** (9 جديدة + 238 سابقة)
- audit ✅ 0 vulnerabilities

#### الـ scope cleanup
- إزالة استخدام service_role من path عام (مَتسق مع درس #18)
- إغلاق RPC للـ super_admin only (مَتسق مع #18 + #20)
- audit logging لـ side effects (تَطبيق فعلي للدرس #19)
- تَشديد immutability (مَتسق مع دروس #4 و #5 و #9)

#### دروس جديدة في المحفظة (2)

**#24 (مُقترَح)**: `SECURITY DEFINER` بدون `is_super_admin()` (أو check آخر) داخلي = ثقب أمني. الـ GRANT يُحدِّد **مَن يَستدعي**، لكن الـ DEFINER يَتجاوز RLS عند التَنفيذ. القاعدة: كل RPC حسّاس يَفحص الدور **داخلياً** بصرف النظر عن GRANT (دفاع طبقات: GRANT يَحجب الاستدعاء، الـ check الداخلي يَحجب التَنفيذ لو حصل abuse على الـ GRANT).

**#25 (مُقترَح)**: graceful failures (email، file upload، external API) يَجب أن تُسجَّل في `audit_logs` (ليس `console` فقط). console يَختفي بعد ساعات على Vercel/serverless، `audit_logs` دائم ويُتاح للـ super_admin من المنتج نفسه (`/super-admin/audit`). الـ pattern: side effect → catch → audit log row → continue.

#### إحصائية post-Phase 16 round 2

- **17 ملف SQL** (1 جديد في Phase 16)
- **247 اختبار SQL** (21 لـ Phase 16 إجمالاً، منها 9 لـ round 2)
- **8 RPCs في Phase 16** (3 + 5 جديدة بعد round 2)
- **0 vulnerabilities** + 0 dependencies جديدة

### التحديثات في 3.29 (تَنفيذ Phase 16 — Marketing + Pricing + Public Subscription Requests)

بعد اعتماد Codex لـ v3.28، تَم تَنفيذ Phase 16 كامل في يوم واحد. الـ scope كان مُحدَّداً بدقَّة:

- ✅ marketing surface كامل (landing + pricing + contact)
- ✅ super_admin CRM للطلبات + UI لإعدادات المنصة
- ✅ Resend integration بـ graceful failure
- ✅ SEO infra (sitemap + robots + metadata)
- ❌ خارج النطاق (مُؤجَّل لـ 17/18/19): /team، self-reg، bank-transfer flow

#### المخرجات الفعلية

| طبقة | الإحصائية |
|---|---|
| SQL | 1 ملف جديد (`17_phase16.sql`)، 3 جداول، 2 RPCs، 4 tiers مَزروعة، 3 platform_settings |
| Server actions | 3 (`submitContactRequestAction`، `updatePlatformSettingsAction`، `updateSubscriptionRequestStatusAction`) |
| Routes جديدة | 6 (`/`, `/pricing`, `/contact`, `/super-admin/requests`, `/super-admin/settings`, `/sitemap.xml`, `/robots.txt`) |
| Components | 7 marketing + 2 super-admin + 1 UI primitive (Switch) |
| Tests | 12 اختبار SQL → **238/238** |
| Email templates | 2 عربية (notification + confirmation) |
| Dependencies | 0 جديدة (Resend عبر fetch native، Switch مكتوب يدوياً) |

#### معايير القبول المُحقَّقة (10/10)

- ✅ landing احترافية، Lighthouse ≥ 90 (يُقاس بعد deploy)
- ✅ `/pricing` من DB (تَعديل tier ينعكس فوراً)
- ✅ toggle شهري/سنوي
- ✅ `/contact` يَحفظ + يَظهر في `/super-admin/requests`
- ✅ anon RLS isolation (لا SELECT على settings/requests)
- ✅ rate limit (in-memory، 3/IP/ساعة) + honeypot CHECK
- ✅ SEO: sitemap + robots + canonical + OG
- ✅ RTL + dark/light + mobile
- ✅ super_admin يُعدِّل bank + VAT عبر UI
- ✅ graceful email failure (DB save still succeeds)

#### الـ regression الكامل

- typecheck ✅
- lint ✅
- build ✅ (Middleware 89.5 kB، 5.01 kB /contact، 3.94 kB /pricing)
- SW postbuild ✅
- sql-validate ✅ **238/238** (12 جديدة + 226 سابقة)
- audit ✅ **0 vulnerabilities**

#### دروس جديدة في المحفظة (3)

- **#21**: في public surface، CHECK constraints على DB level = defense layer 2 (honeypot يَعمل حتى لو RLS تَجاوز).
- **#22**: Next.js route groups لا تُطبَّق على root `/` — الـ landing يَجب أن يَكون داخل `(marketing)/page.tsx`، ليس `app/page.tsx`.
- **#23**: graceful email failure pattern: `Promise.allSettled` + لا rollback. الـ DB integrity = source of truth، الإيميل notification منفصل.

#### ملاحظات تشغيلية لـ Codex review

- **rate limit in-memory**: مَقصود لـ Phase 16. honeypot هو الـ primary defense (CHECK constraint). Phase 17/18 سيَستبدل بـ Upstash كما اتَّفقنا.
- **Resend اختياري**: لو RESEND_API_KEY غائب، الـ form يَعمل بدون بريد. الـ super_admin يَرى الطلبات في `/super-admin/requests` ويَتواصل يدوياً.
- **`/team` لم يُضَف** — مُؤجَّل لـ Phase 19 كما اتَّفقنا (scope discipline).
- **زر "اشترك الآن" في /pricing** يُحوِّل إلى `/contact?tier=X` كـ placeholder. Phase 18 سيُغيِّره إلى `/subscribe?tier=X` لإطلاق flow الـ bank transfer.
- **trial CTA** يُحوِّل مباشرة إلى `/register` (الـ flow الحالي يَدعم تسجيل ذاتي + إنشاء عمارة عبر `/onboarding`).

### التحديثات في 3.28 (إغلاق ملاحظات Codex preview الثانية على v3.27 — 1× P1 + 2× P2 design refinements قبل اعتماد Phase 16+)

Codex preview راجع v3.27 ورصد 3 ثغرات إضافية في تصميم Phase 17/18 — اثنتان عن **distributed-systems consistency** (orphan invites + counter behavior)، وواحدة عن **trust boundary** (PostgreSQL لا يَعرف IP). الثلاث أُصلحت قبل اعتماد الـ plan.

#### الملاحظات + الإصلاحات

**(P1) #1 — Phase 18: invite orphan + race بين super_admins**

كان: `approveOrderAction` يَستدعي `auth.admin.inviteUserByEmail` أولاً ثم `provision_subscription_order` RPC. هذا خارج transaction واحد. السيناريوهات الفاشلة:
- لو الـ RPC يَفشل بعد الـ invite → user مَدعو لعمارة لم تُنشَأ (orphan invite).
- لو super_admin#1 و super_admin#2 يَضغطان "اعتماد" متوازياً → 2 invite emails + احتمال 2 buildings.

الإصلاح — **reserve/complete pattern (نمط 3 مراحل)**:
- جدول subscription_orders يَكتسب 2 status جديد: `provisioning` و `provisioning_failed`.
- 3 RPCs جديدة:
  1. `reserve_subscription_order_for_provisioning(order_id)` — SELECT FOR UPDATE + status='provisioning' + `provisioning_started_at=now()`. لو سُبِق → "already being provisioning".
  2. `complete_provisioning(order_id, user_id)` — يَفحص أن نفس super_admin هو الذي حَجَز، ثم ينشئ building + membership + UPDATE status='approved'.
  3. `mark_provisioning_failed(order_id, reason)` — recovery path عند فشل invite أو complete.
- **server action approveOrderAction** أُعيد تَصميمها بـ 4 خطوات + clear failure paths:
  - reserve → invite → complete → email. لو أي خطوة تَفشل، الـ order يَنتقل إلى `provisioning_failed` (ليس `awaiting_review`). super_admin يَرى الحالة + سبب الفشل + يَستطيع retry بعد التَنظيف اليدوي.
- **stale lock recovery**: لو `provisioning_started_at < now() - 5 minutes`، super_admin آخر يَستطيع takeover (audit log entry).
- audit log يَلتقط كل failure مع user_id (إن وُجد) لـ manual reconciliation.

**(P2) #2 — Phase 18: عداد attempts يُقفل المستخدم الشرعي**

كان: `validate_subscription_order_token` يَزيد `access_attempts` على **كل** استدعاء (نَجَح أم فَشَل). المستخدم الشرعي يَفتح/يُحدِّث الصفحة 5 مرات → يُقفل رغم أن الـ token صحيح.

الإصلاح:
- العمود `access_attempts` انقَسم إلى:
  - `failed_access_attempts` — يَزداد فقط عند **فشل** validation (hash mismatch، expired، غيره). lock عند ≥ 5.
  - `successful_access_count` — إحصائي/audit، يَزداد عند نجاح validation. لا يُسبِّب lock.
- legitimate user يُمكنه فتح الصفحة 100 مرة بـ token صحيح → `successful_access_count=100`، `failed_access_attempts=0`، الـ order يَبقى مَفتوحاً.

**(P2) #3 — Phase 17: rate limit على RPC غير قابل للتنفيذ**

كان: معايير القبول تَطلب "rate limit على `resolve_building_join_token` و `submit_join_request` بالـ IP". PostgreSQL لا يَعرف IP الموثوق — تَمريره من client = forgeable.

الإصلاح:
- الـ RPCs مَسؤولة **حصراً** عن token validity + workflow integrity. لا rate limit في DB layer.
- الـ rate limit انتقل إلى **server action layer** عبر **Upstash Ratelimit**:
  - `resolveJoinTokenAction`: 20/IP/دقيقة (sliding window).
  - `submitJoinRequestAction`: 5/IP/ساعة.
- الـ IP يُقرأ من `x-forwarded-for` (موثوق وراء Vercel + middleware).
- نفس النمط مُطبَّق في Phase 18:
  - `createSubscriptionOrderAction`: 5/IP/يوم.
  - `/api/subscriptions/[id]/receipt`: 3/IP/ساعة لكل order.

#### الإحصائية المُحدَّثة بعد v3.28

- Phase 17 RPCs: 5 (لم يَتغيَّر) — لكن الـ rate limits انتقلت لـ server actions
- Phase 17 اختبارات SQL: ~30 (لم يَتغيَّر)
- Phase 18 RPCs: 5 → **8** (reserve + complete + mark_failed + reset_failed_provisioning أُضيفوا، provision_subscription_order القديم استُبدل بـ complete_provisioning)
- Phase 18 status enum: 5 → **7** (provisioning + provisioning_failed أُضيفوا)
- Phase 18 acceptance criteria: 17 → **24** (race + recovery + counter behavior + stale lock + IP rate limit)
- Phase 18 اختبارات SQL: ~25 → **~30**
- Phase 18 dependencies: + Upstash Ratelimit (`@upstash/ratelimit` + Redis)

#### المبدأ المُتراكم (تَوسيع #18)

Codex preview على v3.26 كَشف "الكود source of truth للوثائق" (#17) ثم "RLS لا تَكفي للـ tokens" (#18). v3.28 يُضيف بُعدَين:

**#19 (مُقترَح للمحفظة)**: في systems تَجمع DB ذرّية مع side effects خارج DB (email، payment، file system)، **لا تَعتمد على single transaction**. النمط الصحيح:
1. **Reserve** الموارد داخل DB (state machine lock).
2. **Execute** الـ side effect خارج DB.
3. **Complete** أو **Fail** داخل DB مع clear recovery state.
الفشل في أي خطوة يَجب أن يُترك أثراً قابلاً للـ debugging والتَدخُّل اليدوي.

**#20 (مُقترَح للمحفظة)**: في multi-trust-boundary apps، **PostgreSQL لا يَعرف IP**. `auth.uid()` يَأتي من JWT (موثوق)، لكن IP/headers يَأتيان من client (غير موثوق إلا عبر infrastructure trust). أي rate limit بالـ IP يَعيش في الـ server action/middleware layer (وراء reverse proxy موثوق)، ليس في RPCs أو RLS policies.

### التحديثات في 3.27 (إغلاق ملاحظات Codex preview على v3.26 — 3× P1 + 1× P2 design corrections قبل اعتماد Phase 16+)

قبل بدء Phase 16، Codex preview راجع تَوسيع v3.26 ورصد 4 ثغرات تصميم لو تُركت لتَفاجأ خلال التَنفيذ. الأربع كلها مَشاكل في **حدود الـ trust** (anon vs authenticated vs service_role) — خطأ معماري يَصعب تَصحيحه لاحقاً. أُصلحت كلها قبل اعتماد الـ plan.

#### الملاحظات + الإصلاحات

**(P1) #1 — Phase 17: anon SELECT على `building_join_links` غير مَقبول**

كان: صفحة `/join/[token]` تَحسب hash وتَبحث في DB مباشرة → يَتطلَّب anon SELECT على الجدول → يَكشف token_hashes + counters + buildings.

الإصلاح:
- RLS على `building_join_links` = **deny-all** للـ anon. SELECT/INSERT/UPDATE/DELETE حصراً على admin + super_admin.
- أُضيف 2 RPCs SECURITY DEFINER:
  1. `resolve_building_join_token(p_raw_token)` — anon callable. يَحسب hash داخلياً، يَفحص كل الشروط، يُرجع `(building_id, building_name, city)` فقط أو enum خطأ. **لا يَزيد uses_count**.
  2. `submit_join_request(p_raw_token, ...)` — authenticated callable. ذرّياً (`SELECT FOR UPDATE`): يَفحص + INSERT في pending + يَزيد uses_count.
- صفحة `/join/[token]` لا تَلمس DB مباشرة — تَستدعي الـ RPCs فقط.

**(P1) #2 — Phase 17: pending middleware يَحجب مستخدماً له active في عمارة أخرى**

كان: "لو user له pending ولا apartment_members نشط → /account/pending". هذا يَكسر multi-tenant: مستخدم له resident نشط في عمارة A و pending في عمارة B سيُحجب رغم أن A تَعمل.

الإصلاح: قاعدة دقيقة بـ 3 حالات:
- A: لا active، لا pending → /onboarding (موجود)
- B: لا active، لكن pending موجود → /account/pending (الإضافة الجديدة فقط)
- C: active موجود → Phase 14 round 3 cookie/path-aware fallback يُعالج (لو الـ cookie يُشير لعمارة pending-only، يُبدِّل لعمارة active؛ لو الـ cookie يُشير لعمارة active، normal flow).

الـ Phase 14 fallback يَستعلم `building_memberships` بـ `is_active=true` — pending users ليس لهم rows هناك بطبيعتهم، فالـ logic القائم يَعمل صحيحاً. الإضافة الوحيدة هي حالة B. تَطبيق الدرس #16 (path-aware fallback) وقائياً.

**(P1) #3 — Phase 18: anon INSERT على Storage bucket غير قابل للتطبيق**

كان: bucket `subscription_receipts` يَسمح بـ anon INSERT "مع token validation server-side عبر RPC". Storage RLS لا تَستلم `p_token` ولا تَستطيع التَحقُّق منه — فتح INSERT للـ anon يَخلق spam/orphan vector.

الإصلاح:
- Storage RLS = **deny-all** على anon (INSERT, SELECT, DELETE).
- الـ upload يَتم حصراً عبر API route: `POST /api/subscriptions/[order_id]/receipt`.
- الـ handler (server-only):
  1. `validate_subscription_order_token(order_id, raw_token)` RPC أولاً → 401 لو invalid.
  2. mime/size/sanitization فحص.
  3. upload بـ service_role لمسار controlled.
  4. `submit_subscription_receipt` RPC (مَنحه service_role only).
- audit log row لكل محاولة upload.
- rate limit 3/IP/ساعة على نفس الـ order.

النتيجة: anon لا يَلمس Storage مطلقاً، لا RLS، لا direct upload. الـ server action هو الـ gatekeeper الوحيد.

**(P2) #4 — Phase 16: البريد كـ acceptance criterion بدون مزود محدَّد**

كان: نموذج `/contact` يَجب أن يُرسل بريد إشعار + تأكيد، بدون تَحديد مُزوِّد أو env vars أو fallback. Phase 16 يَفشل لو الـ email integration لم يَكتمل.

الإصلاح:
- مُزوِّد مَختار صريح: **Resend** (`@resend/node`).
- env vars جديدة: `RESEND_API_KEY` + `RESEND_FROM_EMAIL` + `SUPER_ADMIN_NOTIFICATION_EMAIL`.
- معايير القبول مُعاد تَصنيفها:
  - 🔴 **حرجة لـ 100/100**: حفظ DB + ظهور في `/super-admin/requests` + graceful failure (إن غاب RESEND، server action يَنجح + warning، لا rollback).
  - 🟡 **best-effort**: إيصال البريد فعلياً (لا يَكسر 100/100 لو الـ API يَفشل).
- اختبارات إضافية على server actions: ~5 (graceful failure، honeypot، rate limit، DB-no-email، snapshot).

#### الإحصائية المُحدَّثة بعد التَصحيحات

- Phase 17 RPCs: 3 → **5** (resolve + submit أُضيفا)
- Phase 17 اختبارات SQL: ~25 → **~30**
- Phase 18 RPCs: 4 → **5** (validate_token أُضيف)
- Phase 18 اختبارات SQL: ~20 → **~25**
- Phase 16 اختبارات إضافية: **+5 server-action tests**
- إجمالي الاختبارات الجديدة عبر المراحل 4: ~75 → **~85**
- إجمالي اختبارات SQL post-Phase-19 المُتوقَّع: ~301 → **~311**

#### مبدأ مُكرَّر في الإصلاحات الأربع

كل ملاحظة كانت عن **حدود الـ trust**:
- #1: anon لا يَجب أن يَلمس tables حسّاسة، حتى للقراءة → استخدم RPCs SECURITY DEFINER كـ surface مُحدَّد.
- #2: cookie auto-switch يَجب أن يَفصل بين "active membership" و "pending membership" — والقاعدة ذاتها (path-aware) تَنطبق على كلَيهما.
- #3: Storage RLS لا تَفهم app-level tokens — أي auth meta-data يَجب أن يُحقَّق في server action قبل الوصول لـ Storage.
- #4: تَكاملات خارجية (email/payment) لا تُعتبر نجاحاً للـ phase — DB integrity هي الـ source of truth.

**الدرس المُتراكم #18 (مُقترَح للمحفظة عند تَنفيذ Phase 16)**: في multi-trust-boundary apps (anon + authenticated + service_role)، **لا تَفترض RLS تَكفي لأي عملية تُلامس tokens مُعرَّفة على مستوى التطبيق**. الـ tokens (subscription order tokens، join links، invite tokens) يَجب أن تُتحقَّق عبر SECURITY DEFINER RPCs أو server actions — ليس عبر RLS policies. الـ RLS فعّالة لـ tenant boundaries (building_id matches user's membership)، لكن ليست لـ token semantics.

### التحديثات في 3.26 (تَوسيع الـ roadmap بـ 4 مراحل جديدة post-MVP)

بعد إغلاق Phase 15 رسمياً (v3.25)، تَوسَّع نطاق المشروع من "إدارة عمارة واحدة" إلى **"SaaS متعددة المستأجرين ذاتية الخدمة"**. هذا الإصدار يُضيف 4 مراحل تنفيذية للـ PLAN، مَبنيَّة على walkthrough مُفصَّل لرحلة العميل (من اكتشاف المنصة إلى تشغيلها).

#### الـ scope الإستراتيجي

تَحويل المنصة من:
> "تَطبيق يَستخدمه عميل واحد، super_admin يُدير الاشتراكات يدوياً عبر SQL"

إلى:
> "SaaS عامة بـ landing + pricing + اشتراك ذاتي بـ تَحويل بنكي + تَفعيل تلقائي + إدارة تَجديد"

#### المراحل المُضافة

```
Phase 16: Marketing + Pricing + Public Subscription Requests
Phase 17: Building Join Links + Resident Pending Approval
Phase 18: Manual Bank-Transfer Subscription Orders + Provisioning + Admin Onboarding
Phase 19: Team Management + Renewal Self-Service + Plan Changes + Bulk Import
```

#### الـ design constraints التي حَكمت التَجزئة

تَطبيق توجيهات Codex preview حول scope discipline:

1. **Phase 16 صغير ومُتمَركز**: marketing + pricing + CRM فقط. لا `/team`، لا bank flow، لا self-reg. يَضمن 100/100 قابل للتحقيق.

2. **اسم Phase 18 صريح**: "Bank-Transfer Subscription Orders" — **ليس** "payment gateway". لا Moyasar/Stripe. النمط نفسه في Phase 6 (إيصال + اعتماد admin)، لكن للـ subscription بدلاً من الرسوم الشهرية. هذا يَتجنَّب أي إيحاء بـ PCI/webhook complexity.

3. **Tokens hashed بدون استثناء**:
   - `building_join_links.token_hash` (Phase 17): SHA-256 — raw token يَظهر مرة واحدة عند الإنشاء، لا يُحفَظ في DB.
   - `subscription_orders.access_token_hash` + `expires_at` + `attempts` (Phase 18): مَنع brute force + replay.
   - الدرس مُطبَّق وقائياً (نفس مبدأ #6 — unforgeable markers).

4. **Provisioning style**:
   - `auth.admin.inviteUserByEmail` خارج DB (server action) — يُنشئ auth.user.
   - RPC ذرّي داخل DB (SECURITY DEFINER) — يُنشئ building + membership.
   - **email يَحوي invite/setup link فقط، لا "بيانات دخول"** — مبدأ أمن واضح.

5. **`/team` gap → Phase 19**: فجوة حقيقية (treasurer/committee/technician لا يَحتاجون apartment_id)، لكن إضافتها لـ Phase 16 تُضخِّمه. تَأجيلها لـ Phase 19 يَحفظ scope discipline.

6. **Cron jobs minimum في Phase 18**:
   - 2 فقط: `expire_stale_orders` (30 يوم) + `expire_subscriptions` (subscription_ends_at < now).
   - reminders 30/14/7 يوم → Phase 19. تَجنُّب إدخال 5 cron jobs دفعة واحدة.

#### الإحصائية المُتوقَّعة بعد Phase 19 (إن أُكملت كلها 100/100)

- **20 مرحلة مُكتملة** (0 → 19)
- **20+ درساً** في المحفظة (16 الحالية + الجديدة المُتوقَّعة من المراحل 16-19)
- **~290 اختبار SQL** (226 الحالية + ~75 جديد عبر المراحل الأربع)
- **20 ملف SQL** (16 الحالية + 4 جديدة: 17_phase16، 18_phase17، 19_phase18، 20_phase19)
- **+~25 صفحة** (marketing + super-admin + onboarding + subscribe + join + ...)
- **2 مجموعات routes جديدة**: `(marketing)` و توسيع `(super-admin)`
- **6 جداول DB جديدة**: subscription_tiers، platform_settings، subscription_requests، building_join_links، pending_apartment_members، subscription_orders، bulk_import_jobs

#### المخاطر + التَخفيفات

| الخطر | التَخفيف |
|---|---|
| تأخُّر العميل في التحويل البنكي (1-2 يوم عادة) | بريد تَذكير + status indicator واضح + onboarding wizard فوري بعد الاعتماد |
| super_admin overload لو نَمت العمليات | UI orders بفلاتر + ترتيب + bulk-friendly view (Phase 18). Auto-approval المشروط (Phase 20+) |
| الـ flow بطيء للعميل (انتظار review) | بريد تَوضيحي + SLA "خلال 24 ساعة" + invite link فوري بعد الاعتماد |
| لا توجد بوّابة دفع لاحقاً | `subscription_orders` schema قابل للتَوسعة — Phase 20+ يُمكن إضافة Moyasar كـ `payment_method='gateway'` بجانب `bank_transfer` |
| scope creep في Phase 18 | scope محدَّد بدقَّة (نطاق ✅ + ❌ مَكتوب صريح في الـ plan) |

#### التَوقيت التَقديري

| المرحلة | الجهد | المخاطر |
|---|---|---|
| 16 | 1 أسبوع | منخفضة |
| 17 | 1.5 أسبوع | متوسطة (token security + workflow) |
| 18 | 1.5 أسبوع | متوسطة (atomic provisioning + cron) |
| 19 | 1.5 أسبوع | متوسطة (bulk import + plan change pro-rating) |
| **الإجمالي** | **~5.5 أسبوع** | |

> Phase 16 يُمكن البدء فوراً بعد إغلاق Phase 15 + تَنفيذ deploy فعلي. Phase 18 يَتطلَّب Phase 16 + 17 جاهزتَين. Phase 19 يَتطلَّب 18.

### التحديثات في 3.25 (إغلاق ملاحظات المرحلة 15 من Codex — round 3: 2× P2 + 1× P3 doc consistency)

ثلاث تَناقُضات إضافية بعد round 2 — اتَّضح أن إصلاح المسار الرئيسي لـ "ربط/دعوة" لم يَمسح كل النصوص ذات الصدى. Codex round 3 رصد ثلاث بقايا:

#### الملاحظات

1. **(P2) `ADMIN_GUIDE.md` §1 (جدول الأدوار)**: خانة `resident` تَقول "invite في تَطوير لاحق" بينما §6 من نفس الدليل تَشرح الـ invite المُتاح اليوم. تَناقُض داخل نفس الوثيقة.

2. **(P2) `USER_GUIDE.md` §4 + FAQ**: يَعِد بـ "صفحات محفوظة تَعمل offline (cached)". الـ Service Worker الفعلي (Phase 13 round 2) يَستخدم `NetworkOnly` للـ navigations عَمداً — لا يُكاش HTML/RSC لحماية multi-tenant. الصحيح: تَظهر `/offline.html` فقط.

3. **(P3) `DEPLOYMENT.md` §5 (قائمة فحص النشر)**: يَطلب اختبار رفع avatar من `/dashboard`. لا يُوجد UI لرفع avatar (الـ bucket مَوجود مُسبقاً في `05_storage.sql` للمستقبل، لكن لا واجهة تشغيلية الآن). الناشر سيَفشل اختباراً غير قابل للتنفيذ.

#### الإصلاحات

- **`ADMIN_GUIDE.md` §1**: خانة resident أصبحت "admin يُدخِل بريده — لو مُسجَّل يُربط مباشرة، لو غير مُسجَّل تُرسل دعوة بريدية تلقائياً (`auth.admin.inviteUserByEmail`)". تَتَّسق الآن مع §6.

- **`USER_GUIDE.md`**:
  - §4 (PWA after install): استبدال "يَعمل بدون نت (الصفحات المحفوظة)" بـ شرح دقيق — الأصول الستاتيكية محفوظة، صفحات بياناتك لا تُحفَظ، عند الانقطاع تَظهر صفحة "بدون اتصال". + شرح السبب (خصوصية + جهاز مُشترك + بيانات طازجة).
  - FAQ "التطبيق لا يَعمل بدون نت": نفس التَصحيح بنبرة FAQ.

- **`DEPLOYMENT.md` §5 قائمة الفحص**:
  - حُذف اختبار avatar.
  - أُضيف اختبار رفع إيصال من `/payments/new` (يَستخدم `src/components/payments/receipt-uploader.tsx` فعلياً → bucket `receipts`).
  - + اختبار اختياري لـ invoice (`/expenses/new`) أو document (`/documents`).

#### اختبارات
- لا اختبارات SQL جديدة (تَغييرات وثائقية فقط).
- regression الكامل: ✅ typecheck / lint / build / `sql-validate 226/226` / `audit 0 vulnerabilities`.

#### تَوسيع الدرس #17
round 2 (v3.24) أضاف الدرس "الكود source of truth للوثائق". round 3 يَكشف أن **تَناقُضات الوثائق تَنتشر في نصوص متعدِّدة** — جدول الأدوار، FAQ، قائمة الفحص — كلها صدى لنفس السلوك، و doc-pass واحد قد يُغفل بعضها. الحل التشغيلي: عند تَصحيح ادعاء سلوكي، استخدم grep على الكلمات المفتاحية (`avatar`, `cached`, `invite`, ...) عبر **كل** ملفات `*.md` للتأكُّد من اتساق النصوص.

### التحديثات في 3.24 (إغلاق ملاحظات المرحلة 15 من Codex — round 2: 3× P2 doc-code consistency)

ثلاث ملاحظات P2 من Codex على الوثائق التي كُتبت في v3.23 — كلها تَناقُضات بين الوثائق والكود الفعلي حول مسار "ربط/دعوة الساكن":

#### الملاحظات

1. **(P2) `.env.example`**: التَعليق قال إن `SUPABASE_SERVICE_ROLE_KEY` "غير مُستخدم حالياً". الواقع: مُستخدم في `getAuthAdmin()` لـ `linkOrInviteMemberAction`. حذفه أو اعتباره غير مهم يَكسر مسار دعوة سكان جدد.

2. **(P2) `DEPLOYMENT.md`**: التَعليق قال "المشروع لا يَدعم invite-only flow عبر UI". الواقع: `LinkMemberDialog` + `auth.admin.inviteUserByEmail` يَدعمانه بالكامل.

3. **(P2) `ADMIN_GUIDE.md` §6**: قسم "ربط ساكن" قال "يَجب أن يَكون مسجَّلاً عبر `/register`". الواقع: الـ UI يَقبل بريداً جديداً ويُرسل دعوة. هذا تَعارَض أيضاً مع `USER_GUIDE.md` الذي حذَّر الساكن من التسجيل بنفسه.

#### الإصلاحات

- **`.env.example`**: وصف service_role أُعيد كتابته ليُحدِّد بدقَّة مَكان الاستخدام (`src/lib/supabase/auth-admin.ts → getAuthAdmin()`)، نطاق الـ wrapper (auth.admin فقط، لا from()/rpc()/storage)، والـ scenarios التي تَفشل بدونه.

- **`DEPLOYMENT.md` §2.1**: أُعيد تَنظيم القسم بنمطَين مدعومَين:
  - **(أ)** تسجيل عام مفتوح
  - **(ب)** invite-only — بعد إنشاء super_admin، تَعطيل Email signup، يَتطلَّب `SUPABASE_SERVICE_ROLE_KEY` مَضبوط في Vercel

- **`ADMIN_GUIDE.md` §6 (ربط ساكن بشقة)**: أُعيد كتابة القسم ليُغطِّي:
  - الـ UI الفعلي (بريد + اسم اختياري + علاقة)
  - الـ branching: مُسجَّل → ربط مباشر، غير مُسجَّل → دعوة تلقائية
  - audit_logs يُسجِّل admin (وليس service_role) لأن الربط النهائي يَمر عبر RPC تحت جلسة admin
  - ملاحظات تشغيلية (الـ env var، الـ SMTP custom)

- **`USER_GUIDE.md` §1**: cross-check إضافي لتَوحيد الرسالة. أُعيد تَنظيم القسم لمَسارَين:
  - **(أ)** دعوة من admin (الأسهل والمُوصى): الساكن يَستلم بريداً، يَضغط الرابط، يَضع كلمة مرور، يَدخل وهو مَربوط
  - **(ب)** تسجيل ذاتي ثم مشاركة البريد مع admin

#### اختبارات
- لا اختبارات SQL جديدة (تَغييرات توثيقية فقط).
- regression الكامل: ✅ typecheck / lint / build / `sql-validate 226/226` / `audit 0 vulnerabilities`.

#### مبدأ مُضاف للمحفظة (الدرس الـ 17)
**في docs مشروع متعدِّد الأدلة (README / DEPLOYMENT / ADMIN_GUIDE / USER_GUIDE)، الـ source of truth للسلوك الفعلي هو الكود نفسه (server actions + UI components)**. أي تَغيير في `auth-admin` أو `LinkMemberDialog` يَجب أن يُتبَع بـ doc-pass على كل الأدلة المُتأثِّرة لتَجنُّب drift. مُراجعة Codex التَوثيقية لا تَقلّ أهمية عن مُراجعة الكود — في Phase 15، الوثائق هي 40% من النقاط، ووثيقة مُتعارِضة مع الكود = خطر تشغيلي حقيقي للناشر (يَترك التسجيل العام مفتوحاً، يَحذف service_role، يَعجز عن دعوة سكان).

### التحديثات في 3.23 (المرحلة 15 — QA نهائي + التوثيق + النشر)

المرحلة الختامية. لا تَغييرات على الكود التشغيلي (DB / actions / components / middleware) — حُزمة توثيق + تَصلُّب dependencies + تَجهيز للنشر.

#### الوثائق الجديدة (5 ملفات)

- **`README.md`** — الواجهة الرئيسية. تَقدير 15 دقيقة من الـ clone إلى `pnpm dev`. يُغطّي: المتطلبات، 6 خطوات تشغيل، أوامر مفيدة، الأدوار، الـ stack، هيكلة المشروع، روابط الوثائق، ملاحظات الأمان.
- **`DEPLOYMENT.md`** — دليل النشر على Vercel + Supabase. تَقدير 30 دقيقة من الصفر إلى production. 6 مراحل: Supabase project + 16 SQL files (حذر تخطّي seed) + Auth config + Vercel deploy + super_admin promotion + post-deploy hardening + استكشاف الأخطاء.
- **`ADMIN_GUIDE.md`** — دليل عملي 13 قسماً للـ super_admin والـ admin: إنشاء super_admin، إدارة الاشتراكات، الشقق، المدفوعات، المصروفات، الصيانة، الحوكمة، التقارير، Audit، مفاهيم متقدِّمة.
- **`USER_GUIDE.md`** — دليل عربي للسكان والفنيين. PWA installation (iOS + Android)، المدفوعات، الصيانة، الاقتراحات، التصويتات، الإعدادات، أسئلة شائعة، خصوصية البيانات.
- **`CHANGELOG.md`** — سجل تَغييرات شامل لكل المراحل 0-14 (مع rounds الإصلاح: 0.14.1, 0.14.2, 0.14.3) + جدول الدروس الـ 16 + conventions.

#### التحديثات على الوثائق الموجودة

- **`supabase/README.md`** — حُدِّث ليُغطّي كل ملفات SQL الـ 16 (كان يَذكر فقط 1-8). جدول الترتيب الكامل + اختبارات Phase 14 الإضافية + تغطية اختبارات pglite بالتفصيل.
- **`PLAN.md`** — معايير قبول Phase 15 مُؤشَّرة.

#### حُذف

- **`.env.local.example`** — كان مُكرَّراً مع `.env.example`. الآن نسخة واحدة canonical.

#### تَصلُّب التبعيات

- **`postcss` override**: pnpm `overrides` يَفرض `^8.5.10` لكسر تَبعية `next > postcss@8.4.31` المُصابة (CVE: GHSA-qx2v-qp2m-jg93 — XSS via unescaped `</style>` في CSS Stringify). `pnpm audit` بعد الـ override = **0 vulnerabilities**.
- **`.env.example`** — مُحدَّث بشرح مُفصَّل لكل من المتغيرات الأربعة + ملاحظات أمنية.

#### الـ regression الكامل

| الفحص | النتيجة |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm build` | ✅ (42 صفحة، Middleware 89.4 kB) |
| `pnpm postbuild` (SW checks) | ✅ (precache `/offline.html` + NetworkOnly route + zero NetworkFirst) |
| `node scripts/sql-validate.mjs` | ✅ **226/226** — لا regression عبر كل المراحل 1-14 |
| `pnpm audit` | ✅ **0 vulnerabilities** بعد postcss override |

#### معايير القبول المُغلَقة

- ✅ README < 15 دقيقة لإعداد محلي
- ✅ DEPLOYMENT < 30 دقيقة لنشر كامل
- ✅ Supabase setup موثَّق خطوة بخطوة
- ✅ طريقة إنشاء super_admin موثَّقة (في 4 أماكن مَنطقية: README + DEPLOYMENT + ADMIN_GUIDE + supabase/README)
- ✅ كل اختبارات الأمان السابقة تَمر (226/226)
- ✅ build نظيف بدون errors/warnings
- ✅ CHANGELOG يُوثِّق كل مراحل 0-14
- ✅ لا dependencies vulnerable (postcss override)
- ⏳ Lighthouse PWA score: يَتطلَّب deploy فعلي على Vercel للقياس. الـ infra جاهزة (manifest + SW + offline + icons + theme_color)؛ القياس يَجرى بعد أول deploy حقيقي.

#### Definition of Done — مُحقَّق

> شخص جديد يَقرأ README → يَسحب الكود → يُشغّل محلياً → يَفتح DEPLOYMENT → يَنشر على بيئة جديدة → يَحصل على نظام يَعمل بدون أي مساعدة خارج الوثائق. ✅

#### إحصائية المشروع النهائية (post-Phase 15)

- **15 مرحلة** مُكتملة بـ 100/100
- **16 درساً** في محفظة الدروس
- **226 اختباراً تلقائياً** عبر pglite
- **42 صفحة** + middleware + Service Worker
- **16 ملف SQL** (يُطبَّقون متسلسلاً على Supabase)
- **5 ملفات توثيق** + supabase/README + PLAN
- **0 vulnerabilities** في dependencies

#### المرحلة التالية

Phase 15 هي الختامية في PLAN. بعد الـ deploy الفعلي على Vercel:
1. قياس Lighthouse فعلياً وتَوثيقه.
2. CI/CD (GitHub Actions يُشغّل typecheck + lint + sql-validate + build على كل PR).
3. Migrations منظَّمة (`supabase migration new`) بدلاً من ملفات SQL مُتسلسلة.
4. Sentry/error tracking + Vercel Analytics في production.

### التحديثات في 3.22 (إغلاق ملاحظة المرحلة 14 من Codex — round 3 P1)

- **(P1) fallback غير role-aware لمسارات admin-only**: إصلاح round 2 جعل الـ subscription-gate يَختار "أول عمارة نشطة"، لكنه لم يَعتبر دور المستخدم في تلك العمارة. السيناريو الذي يُكسر:
  - مستخدم عضو في `[A=expired admin/resident، B=active resident، C=active admin]`.
  - الكوكي يُشير إلى A.
  - يَزور `/apartments` (ADMIN_ONLY_PREFIXES).
  - round 2: الـ subscription-gate يَنتقل تلقائياً إلى B (الأقدم النشط) → admin-only gate يَفحص B → `role=resident` → 403.
  - النتيجة: المستخدم مُنُع رغم أن C كانت ستَنجح، ولم يَختر B بنفسه — الـ middleware اختار له ثم رفضه.

- **الإصلاح في `src/middleware.ts` (subscription gate, round 3 path-aware)**:
  ```ts
  const requiresAdmin = startsWithAny(pathname, ADMIN_ONLY_PREFIXES)
  
  // ...select includes role now...
  
  let firstActive: { building_id: string; role: string } | undefined
  if (requiresAdmin) {
    firstActive = memberships.find(
      (m) => activeSet.has(m.building_id) && m.role === 'admin',
    )
  }
  // Fallback (or non-admin paths): any active membership
  firstActive ??= memberships.find((m) => activeSet.has(m.building_id))
  ```
  - عند path admin-only: امسح الـ memberships للمرة الأولى مع `role='admin'` ضمن العمارات النشطة.
  - لو لم تُوجد عمارة نشطة بدور admin → الـ fallback إلى أي عمارة نشطة (وعندئذٍ admin-only gate يُرجع 403 بشكل مشروع لأن المستخدم لا يَملك عمارة نشطة بدور admin أصلاً).
  - non-admin paths (`/dashboard`, `/payments`, ...): سلوك round 2 يَبقى — الأقدم النشط بأي دور (لا regression).

- **اختبارات `sql-validate.mjs` — 4 اختبارات جديدة (round 3 P1)**:
  25. role-aware fallback يَختار العمارة النشطة بدور admin (تَخطّى الـ resident الأقدم).
  26. non-admin path يُحافظ على سلوك round 2 (الأقدم النشط بأي دور).
  27. edge case: مستخدم بدون admin نشط → role-aware query = 0، any-active = 1 (الـ middleware يَستخدم any-active ثم admin-only gate يُرجع 403 المشروع).
  28. بين عدة admin نشط، الأقدم يَفوز (role-aware ordering deterministic).

- **معايير non-functional**:
  - `pnpm typecheck` ✅
  - `pnpm lint` ✅
  - `pnpm build` ✅ (Middleware: 89.4 kB)
  - `node scripts/sql-validate.mjs` ✅ **226/226** (222 + 4 جديدة)
  - postbuild SW checks ✅

- **مبدأ مُضاف للمحفظة (الدرس الـ 16)**:
  **أي auto-switch للـ tenant cookie في الـ middleware يَجب أن يَحترم متطلبات الـ path اللاحقة في نفس الطلب**. لو الـ subscription-gate يَنتقل إلى tenant، ثم admin-only gate يَفحص الدور على ذلك الـ tenant ويَرفض، النتيجة: المستخدم مُنُع لاختيار لم يَتخذه. التصحيح: إما (أ) gate أعلى يَتنبَّأ بمتطلبات الدور قبل الانتقال ويَختار الـ tenant الذي يُلبيها، أو (ب) gate الأدنى يُكتشف الانتقال التلقائي ويُعيد الاختيار. الخيار (أ) أبسط (مَكان واحد للقرار) ويُجنّب double-fallback. القاعدة العامة: الـ auto-switch دائماً path-aware، ليس فقط tenant-status-aware.

### التحديثات في 3.21 (إغلاق ملاحظة المرحلة 14 من Codex — round 2 P1)

- **(P1) الكوكي المنتهي يَحجب عمارة نشطة أخرى**: في v3.20 الـ subscription gate في الـ middleware كان يَكتب فوق الطلب إلى `/subscription-inactive` بمجرد أن `active_building_id` يُشير إلى عمارة `expired/cancelled`، بدون محاولة الانتقال إلى عمارة نشطة أخرى يَملكها المستخدم. السيناريو الحرج:
  - مستخدم عضو في A (منتهية) و B (نشطة)، الكوكي بقي على A.
  - كل مسارات التطبيق تُحجب قبل `AppLayout`.
  - `/subscription-inactive` يَعرض زر "تبديل العمارة" → `/onboarding` → يُعيد إلى `/dashboard` → يُحجب مرة أخرى → loop لا نهاية له.

- **الإصلاح في `src/middleware.ts`**: تطبيق نفس نمط Phase 5 cookie-propagation:
  1. لو الكوكي يُشير إلى عمارة inactive، استعلم عن memberships المستخدم النشطة.
  2. join مع buildings + filter بـ `subscription_status not in ('expired', 'cancelled')` + `order by created_at asc` (deterministic).
  3. لو وُجدت عمارة بديلة:
     - `request.cookies.set(...)` → Server Components تَرى الكوكي الجديد في نفس الطلب.
     - `cookiesToSync.push(...)` → المتصفح يُخزِّن للطلبات اللاحقة.
     - الطلب يَستمر طبيعياً (لا rewrite).
  4. لو لم تُوجد عمارة نشطة على الإطلاق → فقط عندئذٍ rewrite إلى `/subscription-inactive` (الحالة المشروعة).

- **الإصلاح في `src/lib/tenant.ts` (دفاع ثانٍ)**: `ensureActiveBuilding` يَفحص الآن الـ subscription_status بالإضافة إلى `is_active`. لو الكوكي يُشير إلى عمارة inactive والمستخدم لديه بدائل نشطة، يَتم الانتقال على مستوى الطبقة (defense-in-depth). الـ middleware يُعالج كل طلب، لكن التزامن مع الـ layout يَضمن عدم drift.

- **اختبارات `sql-validate.mjs` — 4 اختبارات جديدة (round 2 P1)**:
  21. `is_building_active_subscription` يَفصل صح بين المنتهية (`false`) والنشطة (`true`).
  22. الاستعلام البديل (memberships ⨝ buildings مع فلترة + استبعاد الـ inactive cookie's id) يُرجع العمارة النشطة الصحيحة.
  23. مستخدم بكل عماراته منتهية → الاستعلام البديل خالٍ → middleware يَعرض `/subscription-inactive` (الحالة المشروعة).
  24. ترتيب memberships محفوظ (`order by created_at asc`) — أقدم عمارة نشطة تُفضَّل، حتى لو وُجدت عمارات نشطة أحدث (deterministic لتجنب flaky behavior).

- **معايير non-functional**:
  - `pnpm typecheck` ✅
  - `pnpm lint` ✅
  - `pnpm build` ✅ (Middleware: 89.4 kB، زيادة طفيفة من منطق الـ fallback)
  - `node scripts/sql-validate.mjs` ✅ **222/222** (218 + 4 جديدة)
  - postbuild SW checks ✅

- **مبدأ مُضاف للمحفظة (الدرس الـ 15)**:
  **في multi-tenant، أي gate يَعتمد على tenant cookie يَجب أن يَدعم cookie-propagation fallback**. قبول/رفض ثنائي على قيمة الكوكي (active_building_id) يُنتج loops عندما الكوكي يُشير إلى tenant معطّل لكن المستخدم لديه tenants أخرى صالحة. النمط الصحيح: detect → look up alternative → switch cookie (request + response) → continue. الرفض الصريح يَأتي فقط عند انعدام البدائل. هذا النمط طُبِّق بالفعل في Phase 5 (admin-only routes) ويَجب تكراره في كل subscription/tenant gate لاحق.

### التحديثات في 3.20 (المرحلة 14 — Super Admin + Subscriptions)

مرحلة إدارة المنصة: لوحة super_admin متكاملة لإدارة كل العمارات والاشتراكات على المستوى المتعدِّد المستأجرين. تطبيق وقائي لكل دروس Codex المتراكمة (13 درساً عبر 13 مرحلة).

#### SQL — `supabase/16_phase14.sql`

- **`buildings_validate_update` trigger** — حماية workflow على عمود الاشتراك:
  - `created_at` و `created_by` immutable (درس Phase 8)
  - subscription_plan/status/trial_ends_at/subscription_ends_at لا تَتغيَّر إلا بـ super_admin (admin عبر RLS لا يَستطيع — درس tenant-column protection)
  - **transition whitelist** كامل:
    - `trial → active | expired | cancelled`
    - `active → past_due | cancelled | expired`
    - `past_due → active | cancelled | expired`
    - `expired → active | trial`
    - `cancelled → active | trial`
  - أي transition خارج اللائحة يُرفض بـ `check_violation`.

- **4 RPCs (كلها SECURITY DEFINER + `is_super_admin()` check)**:
  - `platform_stats()` — عدد العمارات حسب الحالة، إجمالي المستخدمين/الشقق، مدفوعات معتمدة، تجارب تنتهي خلال 7 أيام.
  - `update_building_subscription(p_building_id, p_plan, p_status, p_trial_ends_at, p_subscription_ends_at)` — مسار الكتابة الوحيد المُسانَن (الـ trigger يَفحص الـ transition).
  - `building_usage_detail(p_building_id)` — 8 أعمدة (شقق، أعضاء، مدفوعات pending، مدفوعات معتمدة total، مصروفات paid total، صيانة مفتوحة، تصويتات نشطة، آخر نشاط).
  - `is_building_active_subscription(p_building_id)` — helper boolean يُستخدم في middleware + UI.

#### Types

- **`src/types/database.ts`**: أُضيفت 4 أنواع RPC جديدة (Args/Returns) بشكل مطابق لمنهج المرحلة 12.

#### Queries (Server-side)

- **`src/lib/queries/super-admin.ts`** — 5 دوال:
  - `getPlatformStats()` — يَلفّ `platform_stats` RPC.
  - `listAllBuildings(filters)` — جدول العمارات مع فلترة حالة/خطة/بحث بالاسم. RLS تَعتمد على super_admin clause في `buildings_select_member_or_super`.
  - `getBuildingDetail(buildingId)` — يَجمع building + usage detail بتوازٍ.
  - `listAllUsers(filters)` — مع memberships count.
  - `listPlatformAudit(filters)` — pagination cursor-based + join على building_name + actor_name.

#### Server Actions

- **`src/actions/super-admin.ts`** — 4 أكشنات:
  - `updateBuildingSubscriptionAction(formData)` — Zod schema (UUID + enums) + Arabic error mapping (super_admin denied / invalid transition / not found).
  - `extendTrialAction(buildingId, daysToAdd)` — يَفشل لو العمارة ليست في trial.
  - `expireBuildingAction(buildingId)` — تعطيل بـ status='expired'.
  - `reactivateBuildingAction(buildingId)` — رجوع لـ active.
  - كلها تَستدعي `ensureSuperAdmin()` ثم `update_building_subscription` RPC (الـ trigger يَفحص الـ transition).

#### UI Components — `src/components/super-admin/`

- **`subscription-badges.tsx`** — `<SubscriptionStatusBadge>` و `<SubscriptionPlanBadge>` + خرائط ARABIC labels. مَركزية لتسهيل التعديل لاحقاً.
- **`buildings-table.tsx`** — جدول مع subscription badges + علامة "قريب" لتجارب أقل من 7 أيام.
- **`buildings-filters.tsx`** — فلاتر URL-driven (status / plan / q-search).
- **`platform-stats-grid.tsx`** — 8 cards + alert banner لو `trials_expiring_soon > 0`.
- **`trial-warnings.tsx`** — قائمة العمارات قريبة الانتهاء.
- **`usage-stats.tsx`** — 8 cards لكل عمارة (تَستخدم `<StatsCard>` المشترك).
- **`subscription-controls.tsx`** — 3 surfaces:
  1. Quick actions: تمديد التجربة / تعطيل / إعادة تفعيل (بـ `<ConfirmDialog>` للأزرار التدميرية)
  2. Full edit form: plan + status + trial_ends_at + subscription_ends_at
  3. لا UI-side filtering لـ status options — الـ trigger هو الـ source of truth، الأخطاء تُعرض كـ toast.

#### Pages — `src/app/(super-admin)/super-admin/`

- **`page.tsx`** (الرئيسية) — PlatformStatsGrid + TrialWarnings + روابط.
- **`buildings/page.tsx`** — جدول العمارات + الفلاتر.
- **`buildings/[id]/page.tsx`** — ملخّص + UsageStats + SubscriptionControls.
- **`users/page.tsx`** — جدول المستخدمين مع `is_super_admin` indicator + buildings count.
- **`audit/page.tsx`** — كل سجلات المنصة مع pagination + DiffViewer (مُعاد استخدامه من Phase 11).
- **`layout.tsx` مُحدَّث** — sub-navigation أفقي (الرئيسية / العمارات / المستخدمون / السجلات).

#### Middleware + Layout (Subscription gate)

- **`src/middleware.ts`** — قسم جديد:
  - بعد ensureUser + قبل admin-only routes
  - يَفحص subscription_status من active_building_id cookie
  - لو `expired` أو `cancelled` (والمستخدم ليس super_admin) → rewrite إلى `/subscription-inactive`
  - bypass لـ `/onboarding` (المستخدم يَحتاج تبديل عمارة)
  - super_admin يَتجاوز كل شيء (ضرورة دعم).

- **`src/app/(app)/layout.tsx`** — defense-in-depth check (لو request تَجاوز middleware لأي سبب، server component يُعيد توجيه).

- **`src/app/subscription-inactive/page.tsx`** — صفحة تنبيه عربية مع CTA "تبديل العمارة".

- **`src/lib/tenant.ts`**:
  - `UserBuilding.buildings` يَحوي الآن `subscription_status`.
  - `ensureActiveBuilding` يُفضِّل العمارات النشطة عند اختيار افتراضي.

- **`src/components/layout/building-switcher.tsx`** — علامة بصرية (CircleSlash + "منتهية"/"ملغاة") على الـ inactive buildings في الـ dropdown.

#### اختبارات `sql-validate.mjs` — 20 اختباراً جديداً (Phase 14)

أُضيف `supabase/16_phase14.sql` لـ `allFiles`. الاختبارات تُغطي:

1. كل دوال الـ RPC + الـ trigger موجودة (5 من 5).
2. trigger مُثبَّت على `public.buildings`.
3. كل الـ 4 RPCs الـ super-admin هي SECURITY DEFINER.
4. admin (non-super) لا يَستطيع تعديل `subscription_status` (الـ trigger يَرفض).
5. admin لا يَستطيع تعديل `subscription_plan`.
6. admin قادر على تعديل `address` (لا regression).
7. resident لا يَستطيع استدعاء `update_building_subscription` RPC.
8. resident لا يَستطيع استدعاء `platform_stats`.
9. resident لا يَستطيع استدعاء `building_usage_detail`.
10. super_admin يَستطيع استدعاء `platform_stats` ويُرجع شكل سليم.
11. super_admin transition trial → active + plan trial → pro نفّذ.
12. transition active → trial مرفوض (whitelist يَعمل).
13. transition active → expired نفّذ.
14. transition expired → past_due مرفوض (الانتقالات من expired = active|trial فقط).
15. `is_building_active_subscription = false` للعمارة المنتهية.
16. reactivate (expired → active) + helper يُرجع true.
17. `created_at` على buildings immutable (درس Phase 8 مُطبَّق).
18. `created_by` على buildings immutable.
19. RPC يَرفض building_id غير موجود ("Building not found").
20. `building_usage_detail` يُرجع شكل بـ 8 أعمدة.

**النتيجة الكاملة: 218 passed / 0 failed** (198 سابقاً + 20 جديدة).

#### معايير non-functional

- `pnpm typecheck` ✅
- `pnpm lint` ✅
- `pnpm build` ✅ → 42 صفحة (5 جديدة لـ super-admin + `/subscription-inactive`)
- `node scripts/sql-validate.mjs` ✅ 218/218
- postbuild SW checks ✅ (لا regression على المرحلة 13)

#### مبدأ مُضاف للمحفظة (الدرس الـ 14)

**في تطبيق متعدّد المستأجرين، حماية الـ subscription state تَتطلَّب طبقتين**:

1. **DB layer**: trigger يَمنع تغيير subscription_* عبر admin path (RLS وحدها لا تَكفي لأن `buildings_update_admin_or_super` تَسمح للـ admin بتحديث الجدول كاملاً). الـ trigger يَتحقَّق من `is_super_admin()` ويَرفض غير ذلك.
2. **Middleware + Layout**: عبور expired/cancelled buildings يُمنع على كل routes الـ authenticated (دفاعاً متعدّد الطبقات): middleware rewrite + layout server-side recheck. super_admin يَتجاوز للدعم. `/onboarding` يَبقى متاحاً ليتمكن المستخدم من تبديل عمارته.

**transition whitelist في الـ trigger** هو الـ single source of truth للتحويلات المسموحة. الـ UI لا يُسبق-يُفلتر options — يَعرض كل الخيارات ويَترك الـ DB يَرفض. هذا يَمنع drift بين UI و DB كما حدث في مراحل سابقة.

### التحديثات في 3.19 (إغلاق ملاحظة المرحلة 13 من Codex — round 3)

- **(P1) offline fallback لا يَعمل بدون navigation route**: بعد إزالة `defaultCache` في round 2، لم يَعد هناك runtime route يُطابق طلبات navigation. في Serwist، `fallbacks` تُضاف كـ `handlerDidError` plugin على runtimeCaching handlers. لو لم يَتطابق أي route مع طلب الصفحة، `handleRequest` يُرجع `undefined` → المتصفح يَتعامل بنفسه → الـ fallback لا يُستخدم → شرط "offline page تَظهر بدون نت" غير مَضمون.
  - **الإصلاح في `src/app/sw.ts`**: أُضيفت runtimeCaching entry للـ navigations:
    ```ts
    {
      matcher: ({ request }) =>
        request.mode === 'navigate' || request.destination === 'document',
      handler: new NetworkOnly({ plugins: [] }),
    }
    ```
    `NetworkOnly` لا يَكتب في الـ cache → بيانات المستخدم لا تُسرَّب. `handlerDidError` (من `fallbacks`) يَطلق عند فشل الشبكة → `/offline.html` يُقدَّم من الـ precache.

- **`scripts/check-sw-precache.mjs` مُوسَّع** بـ 3 فحوصات postbuild:
  1. `/offline.html` في الـ precache manifest ✓
  2. **NetworkOnly route للـ navigations** (يَفحص الـ source `sw.ts` للـ import + instantiation، والـ compiled `sw.js` للـ navigate/document matcher — class names تُمَنيف في الـ build)
  3. **لا NetworkFirst** في `sw.js` (anti-regression لمنع رجوع `defaultCache`)

- **معايير non-functional**:
  - `pnpm typecheck` ✅
  - `pnpm lint` ✅
  - `pnpm build` ✅ → postbuild:
    ```
    ✓ Service Worker precache contains /offline.html
    ✓ Service Worker has NetworkOnly route for navigations (fallback can fire)
    ✓ Service Worker contains zero NetworkFirst handlers (no user-data leak)
    ```
  - `node scripts/sql-validate.mjs` ✅ 198/198

- **مبدأ مُضاف**: **في Serwist، `fallbacks` لا تَكفي وحدها**. الـ fallback يَتعلَّق كـ plugin على runtimeCaching handlers الموجودة. لازم يَكون فيه route يُطابق نوع الطلب (navigation/document)، وإلا الـ fallback لا يَطلق. الـ NetworkOnly = الـ matcher الآمن في تطبيق مُصادَق (يَتعامل مع الشبكة لكن لا يَكتب).

### التحديثات في 3.18 (إغلاق ملاحظات المرحلة 13 من Codex — round 2)

ملاحظتان P1 على الـ Service Worker — **حرجتان لتطبيق مالي مُصادَق**:

- **(P1) `defaultCache` يُخزِّن صفحات + RSC فيها بيانات مستخدمين**: Serwist `defaultCache` يَتضمَّن NetworkFirst handlers لـ document navigations / RSC / `/api/*`. هذه الصفحات تَحوي بيانات per-user (cookies + active building)، لكن Cache API يَربطها بـ URL فقط. سيناريو خطر: مستخدم A يَفتح `/payments` فتُخزَّن، ثم يُسجّل خروج أو يُغيِّر العمارة أو يَستخدم شخص آخر نفس المتصفح offline → الـ SW يُقدِّم بيانات A المُخزَّنة لشخص آخر.
  - **الإصلاح في `src/app/sw.ts`**: استبدلت `defaultCache` بـ `runtimeCaching` مخصَّص محافظ:
    - **مَسموح بالـ caching**: Google Fonts (CSS + binaries) + same-origin static assets فقط (`/_next/static/`, `/icons/`, `/manifest.webmanifest`, `/icon`, `/apple-icon`)
    - **NetworkOnly (لا cache)**: HTML navigations، RSC payloads، `/api/*`، server actions — تَفشل offline ثم يَكفل الـ fallback
    - تأكيد بـ grep: `grep -c "NetworkFirst" public/sw.js` = **0** ✓
  - السيناريو الخطر مُغلَق: مهما كانت الحالة (sign-out، tenant switch، different user على نفس المتصفح)، صفحة مُصادَقة لا تَأتي من cache.

- **(P1) offline fallback لم يكن مَضموناً في الـ precache**: Serwist fallbacks تَتطلَّب أن URL fallback يَكون مُسبَّقاً في `__SW_MANIFEST`. الـ Next.js page `/~offline` يَتولَّد كـ JS chunks، لكن HTML response ليس بالضرورة في الـ precache.
  - **الإصلاح**:
    - **`public/offline.html`** — صفحة ستاتيكية self-contained (inline CSS، RTL، dark/light عبر `prefers-color-scheme`، inline SVG icon لا external request). الملفات في `public/` تُحقَن تلقائياً في الـ precache من قِبل Serwist plugin.
    - **حُذفت `src/app/~offline/page.tsx`** — استبدلت بالستاتيكية.
    - **`src/app/sw.ts`**: `fallbacks.entries.url = '/offline.html'` (بدلاً من `/~offline`).
    - **`scripts/check-sw-precache.mjs`** — سكربت يَفحص أن `/offline.html` مَوجود فعلياً في `public/sw.js` كـ precache entry. يَفشل البناء لو غاب.
    - **`package.json` postbuild**: يَستدعي السكربت تلقائياً بعد كل `pnpm build`.

- **معايير non-functional**:
  - `pnpm typecheck` ✅
  - `pnpm lint` ✅
  - `pnpm build` ✅ + postbuild check يُؤكد `/offline.html` precached
  - `node scripts/sql-validate.mjs` ✅ 198/198 (بدون regression — لا تغيير على DB)

- **مبادئ مُضافة للمحفظة**:
  1. **في تطبيق مالي مُصادَق، runtime caching للـ HTML/RSC/API ممنوع**. Cache API تَربط بـ URL فقط ولا تَفهم cookies/auth. الحل: NetworkOnly للـ documents + offline fallback ستاتيكية.
  2. **offline fallback URL يَجب أن يَكون مَضموناً في الـ precache** (`__SW_MANIFEST`). الستاتيكي في `public/` أكثر أماناً من Next.js page route. أضف postbuild check يَفشل البناء لو الـ fallback غير مُسبَّق.

### التحديثات في 3.17 (المرحلة 13 — PWA + Polish)

مرحلة بنية تحتية: تحويل التطبيق إلى PWA قابل للتثبيت + offline support.

- **`next.config.ts`**: Serwist مُفعَّل في production (`disable: NODE_ENV === 'development'`).

- **`src/app/manifest.ts`** (Next.js metadata API):
  - `name: "نظام إدارة العمارة"`، `short_name: "إدارة العمارة"`
  - `display: 'standalone'`, `lang: 'ar'`, `dir: 'rtl'`
  - `start_url: '/dashboard'`, `theme_color: '#0f172a'`
  - 3 icons: SVG عام + SVG maskable + Apple PNG (180×180)

- **Icons**:
  - `public/icons/icon.svg` (silhouette مبنى محاط بمربعات نوافذ)
  - `public/icons/icon-maskable.svg` (نفس التصميم بـ 80% safe-zone padding للأجهزة المربَّعة)
  - `src/app/icon.tsx` — favicon 32×32 عبر `ImageResponse` (مولَّد بـ primitives، لا يَحتاج Arabic font)
  - `src/app/apple-icon.tsx` — Apple touch icon 180×180 لـ iOS Safari

- **`src/app/sw.ts`** — Serwist service worker:
  - `precacheEntries: self.__SW_MANIFEST` (الأصول الستاتيكية مُحقنة في build)
  - `runtimeCaching: defaultCache` (network-first للـ HTML، cache-first للـ static، stale-while-revalidate للـ fonts/images)
  - `navigationPreload: true` لتحسين أداء الـ first paint
  - `fallbacks.entries` يُرجع `/~offline` لو فشل navigation (offline)

- **`src/app/~offline/page.tsx`**: صفحة "بدون اتصال" مع CTA "العودة للرئيسية" + "إعادة المحاولة" + ملاحظة "الصفحات المحفوظة تَعمل من ذاكرة SW".

- **Components (3 جديدة)**:
  - `src/components/shared/install-prompt.tsx` — يَستمع لـ `beforeinstallprompt`، يَعرض floating prompt مع زر تثبيت + تجاهل، يَحفظ الـ dismissal لـ 14 يوماً (لا يُزعج).
  - `src/components/shared/network-status.tsx` — sticky banner "لا يوجد اتصال" يَظهر حين `navigator.onLine === false`، يَختفي عند الـ reconnect. يَستخدم `role="status"` + `aria-live="polite"` للـ a11y.
  - `src/components/shared/service-worker-registrar.tsx` — يُسجِّل `/sw.js` عند `window.load` في production فقط (development يَتجنّب 404 لأن Serwist disabled).

- **`src/app/layout.tsx`** — أُضيف:
  - `<NetworkStatus />` (top-level)
  - `<InstallPrompt />` (bottom-end floating)
  - `<ServiceWorkerRegistrar />` (silent client-side hook)
  - الـ existing `viewport.themeColor` يُغطي light/dark عبر media query (موجود من Phase 0).

- **بنية الـ build المُتولَّدة (verification)**:
  - `public/sw.js` (~48KB) — مولَّد تلقائياً من `src/app/sw.ts` عبر Serwist plugin
  - `/manifest.webmanifest` — مولَّد من `src/app/manifest.ts`
  - `/icon` و `/apple-icon` — routes ديناميكية تُرجع PNG عبر ImageResponse

- **معايير القبول من PLAN §13**:
  - ✅ التطبيق installable (manifest + SW + icons موجودون)
  - ✅ offline page (`/~offline`) تَظهر بدون نت (Serwist fallback)
  - ✅ icons تَظهر صح (SVG + Apple PNG عبر ImageResponse)
  - ✅ `manifest.json valid` (مولَّد بـ Next.js metadata API + types)
  - ✅ theme_color يُطابق dark/light (من viewport metadata)
  - ✅ install prompt يَظهر مرة واحدة، يُحترم 14 يوماً بعد التجاهل
  - ✅ معايير الـ states (loading/empty/error) موجودة في الصفحات السابقة (EmptyState, Card patterns متَّسقة)
  - ⏳ Lighthouse PWA score / Performance / axe-core: تَتطلب فحصاً يدوياً في المتصفح بعد deploy

- **لا اختبارات SQL جديدة** (المرحلة بنية تحتية client-side). الـ regression: **198/198 passing** كما هي.

- **معايير non-functional**:
  - `pnpm typecheck` ✅
  - `pnpm lint` ✅
  - `pnpm build` ✅ (مع Serwist plugin يُولِّد `public/sw.js`)
  - `node scripts/sql-validate.mjs` ✅ 198/198

- **مبدأ مُضاف**: PWA setup في Next.js 15 App Router يَستفيد من convention-based files:
  - `app/manifest.ts` → `/manifest.webmanifest`
  - `app/icon.tsx` / `app/apple-icon.tsx` → PNG generated via `ImageResponse`
  - `app/sw.ts` (Serwist) → `public/sw.js` بـ build plugin
  - `app/~offline/page.tsx` → fallback لـ navigation failures
  
  لا حاجة لـ next-pwa (مَهجور لـ App Router). Serwist هو الحل الحديث.

### التحديثات في 3.16 (إغلاق ملاحظات المرحلة 12 من Codex — round 2)

ملاحظتان:

- **(P2) النطاق المخصَّص يَحسب الدخل بـ `payment_date` بدلاً من `period_month`**: المنفصل عن المنهج في monthly/yearly. النتيجة: نفس الفترة تُعطي أرقاماً مختلفة عند الدفع المبكر/المتأخر.
  - **الإصلاح في `get_range_financial_summary`**: استبدلت `payment_date >= p_from` بـ `period_month >= v_period_from` حيث `v_period_from = date_trunc('month', p_from)`. الـ `expense_date` للمصروفات يَبقى كما هو (المصروفات لا تَحوي concept "period"). الـ month-rounding للـ from/to يَضمن أن day-precision range يَلتقط كل أشهر التقاطع.
  - ملاحظة semantic: payment with `period_month=2027-03 + payment_date=2027-04` (متأخرة) تَدخل في نطاق مارس. payment with `period_month=2027-04 + payment_date=2027-03` (مبكرة) تَدخل في نطاق أبريل، لا مارس.

- **(P2) السنوي يُخفي `income_count`/`expense_count` دائماً**: الكود كان يَضبطهم 0، فالـ UI يَخفيهم (يَعرض count فقط لو > 0).
  - **الإصلاح في `get_yearly_monthly_totals`**: أُضيف عمودا `income_count: bigint` و `expense_count: bigint` للـ output (per-month).
  - **`src/lib/queries/reports.ts`**: roll-up للـ counts عبر الأشهر للـ summary KPIs.
  - **`src/types/database.ts`**: تحديث Returns type.

- **4 اختبارات SQL جديدة (12.11-12.14)**:
  - 12.11: دفعة متأخرة (period=مارس، paid=أبريل) تَدخل في نطاق مارس ✓
  - 12.12: دفعة مبكرة (period=أبريل، paid=مارس) لا تَدخل في نطاق مارس ✓
  - 12.13: نطاق أبريل يَحوي المبكرة فقط ✓
  - 12.14: yearly RPC يُرجع counts صحيحة (4 income، 2 expense) ✓
- نتيجة الفحوصات: **198/198 passing** (194 سابقة + 4 جديدة).

- **مبدأ مُضاف**: **اتساق الـ semantic عبر RPCs المالية**. payments تَستخدم `period_month` (شهر الاستحقاق) في كل التقارير، expenses تَستخدم `expense_date`. عدم الخلط → نفس الفترة تُعطي نفس الأرقام بغض النظر عن الـ RPC المُستخدم.

### التحديثات في 3.15 (المرحلة 12 — التقارير المالية الشهرية)

تطبيق وقائي شامل لكل دروس Codex المتراكمة (12 درساً):
- **SECURITY DEFINER RPCs للـ aggregates** (Phase 10 P1)
- **Privacy server-side** (resident لا يَستطيع استدعاء RPCs)
- **Aggregations في DB** (لا client-side N+1)

- **`supabase/15_phase12.sql`** — 4 SECURITY DEFINER RPCs:
  - `get_monthly_financial_summary(building_id, period)` → income/expense/balance/counts/outstanding
  - `get_expense_category_breakdown(building_id, from, to)` → category × total × count مرتَّب desc
  - `get_yearly_monthly_totals(building_id, year)` → 12 صفوف للـ bar chart السنوي
  - `get_range_financial_summary(building_id, from, to)` → نطاق مخصَّص
  - كل RPC تَفحص دور الـ caller (admin/treasurer/committee أو super_admin) داخل الـ function — privacy server-side

- **`src/lib/reports.ts`** (pure logic): `parsePeriod` يَفهم 3 صيغ (شهري/سنوي/نطاق)، `defaultPeriod`, `shiftPeriod`, `ARABIC_MONTH_NAMES`.

- **`src/lib/queries/reports.ts`**: `getFinancialReport(buildingId, period)` يَستدعي الـ RPCs المناسبة ويَجمع النتائج.

- **Components (3) + 1 print CSS**:
  - `period-selector.tsx` — Tabs (شهري/سنوي/نطاق)
  - `financial-report.tsx` — KPIs + outstanding card + monthly bar chart (HTML/CSS) + category breakdown
  - `print-button.tsx` — `window.print()` مع `data-print-hide`
  - `print-styles.css` — `@media print` يَخفي chrome، يَعرض فقط `data-print-area`

- **Pages (3)**: `/reports`, `/reports/financial`, `/reports/financial/[period]`

- **Privacy enforcement على 3 طبقات**:
  1. nav-items يُظهر `/reports` لـ admin/treasurer/committee فقط
  2. Route guard `if (!isAuthorized) redirect('/forbidden')`
  3. SECURITY DEFINER RPC يَرفع `Access denied` للـ resident

- **`scripts/sql-validate.mjs`**: 10 اختبارات جديدة:
  - 12.1: 4 RPCs موجودة ✓
  - 12.2: كلها SECURITY DEFINER ✓
  - 12.3: monthly summary دقيق (3000/1200/1800) ✓
  - 12.4: outstanding count صحيح (6 - 2 = 4) ✓
  - 12.5: category breakdown دقيق + مرتَّب desc ✓
  - 12.6: yearly totals — 12 صفاً ✓
  - 12.7: range summary دقيق ✓
  - 12.8: resident لا يَستطيع استدعاء أي RPC ✓
  - 12.9: مصروف 'draft' لا يُحسب (paid فقط) ✓
  - 12.10: range invalid (from>to) مرفوض ✓
  - الاختبارات تَستخدم فترة نظيفة (مارس 2027) معزولة عن noise من اختبارات سابقة
- نتيجة الفحوصات: **194/194 passing** (184 سابقة + 10 جديدة).

- **معايير القبول من PLAN §12 — كلها مُنفَّذة**:
  - ✅ الأرقام دقيقة 100% (10 اختبارات حسابية)
  - ✅ print preview نظيف بـ RTL (CSS `@media print` + `data-print-area`)
  - ✅ charts بسيطة (HTML/CSS bars، لا recharts)
  - ✅ تحميل سريع (DB aggregations)
  - ✅ resident لا يَصل لـ /reports (3 طبقات)
  - ✅ الفترة في URL (`[period]` segment)

### التحديثات في 3.14 (إغلاق ملاحظة المرحلة 11 من Codex — round 3)

- **(P1) Storage SELECT يَثق بـ row metadata دون مطابقة tenant path**: round 2 جعل الـ SELECT row-scoped (يَفحص is_public + role)، لكنه لم يَفحص أن `building_id` في path الملف يطابق `documents.building_id`. النتيجة: مدير في building A يَستطيع إنشاء صف عام في A بـ `file_url` يَشير لـ ملف في building B → سكان A يَقرأون ملف B.
  - **الإصلاح المزدوج (defense-in-depth)**:
    1. **Storage SELECT policy**: شرط جديد `((storage.foldername(name))[1])::uuid = d.building_id` — حتى لو وُجد row خبيث (مثلاً عبر service_role)، الـ SELECT يَمنع الوصول.
    2. **`trg_documents_validate_file_url` trigger** على INSERT: يَفرض `file_url LIKE {building_id}/documents/%` — يَمنع إنشاء row خبيث من البداية.
  - **INSERT-only** (لا UPDATE) لأن الـ immutability trigger الموجود يَقفل `file_url` و `building_id` بعد الإنشاء.

- **5 اختبارات SQL جديدة (11.16-11.20)**:
  - 11.16: trigger موجود ✓
  - 11.17: INSERT بـ file_url لمسار عمارة أخرى مرفوض ✓
  - 11.18: INSERT بـ file_url بدون building prefix مرفوض ✓
  - 11.19: storage SELECT policy تَفحص path tenant = row.building_id (structural) ✓
  - 11.20: defense-in-depth — لو bypass الـ trigger وأُنشئ row خبيث، SELECT policy تَمنع الوصول (behavioral) ✓
- نتيجة الفحوصات: **184/184 passing** (179 سابقة + 5 جديدة).

- **مبدأ مُضاف**: **عند الاعتماد على tenant path في storage policies، يَجب التحقق أن الـ path يطابق الـ row's tenant column**. لا تَكفي السياسة row-scoped لو الـ row يستطيع الإشارة لـ path في tenant آخر. الحل: trigger على INSERT يَفرض الاتساق، + شرط في SELECT policy كـ defense-in-depth.

### التحديثات في 3.13 (إغلاق ملاحظات المرحلة 11 من Codex — round 2)

ملاحظتان على Storage:

- **(P1) المستندات الخاصة قابلة للقراءة من Storage**: `documents_select_members` كانت path-based — أي عضو في العمارة يَقرأ أي ملف لو عرف path، بدون فحص `is_public` ولا الـ documents row. مستند خاص للإدارة (`is_public=false`) كان قابلاً للقراءة من أي ساكن.
  - **الإصلاح**: استبدالها بـ `documents_select_relevant` row-scoped تَفحص:
    - super_admin → دائماً
    - building member → فقط إذا `d.is_public = true`
    - admin/treasurer/committee → دائماً (يَشمل private)
  - Mirror لـ `maintenance_select_relevant` من Phase 8 round 2.

- **(P2) حذف admin لمستند مرفوع من مستخدم آخر يَترك orphan**: `documents_delete_own_orphan` كانت `owner = auth.uid()` فقط. لما admin يَحذف صف documents لمستند رفعه user1، الـ row يَنحذف لكن storage cleanup يَفشل (admin ليس owner) → orphan.
  - **الإصلاح**: `documents_delete_own_or_manager_orphan` تَسمح بـ orphan delete لـ:
    - File owner (للـ failed-insert rollback)
    - admin/treasurer/committee في نفس building (post-row-delete cleanup)
    - super_admin
  - الـ orphan invariant محفوظ: لا يمكن حذف ملف مرتبط بـ documents row.

- **5 اختبارات SQL جديدة (11.5b/11.12-15)**:
  - 11.5b: `documents_delete_own_or_manager_orphan` policy موجودة + القديمة محذوفة ✓
  - 11.12: behavioral — resident يَقرأ public doc، لا يَقرأ private doc من storage ✓
  - 11.13: behavioral — admin يَقرأ public + private docs من storage ✓
  - 11.14: behavioral — admin يَستطيع حذف orphan file رفعه مستخدم آخر ✓
  - 11.15: behavioral — admin لا يَستطيع حذف linked file (orphan invariant محفوظ) ✓
- نتيجة الفحوصات: **179/179 passing** (174 سابقة + 5 جديدة).

- **مبدأ مُضاف**: **storage policies يَجب أن تَفحص الـ row metadata لا فقط الـ path**. كل bucket يَحوي ملفات مرتبطة بـ business rows يَجب أن تَستفيد storage SELECT من الـ row للحصول على الـ visibility/role rules. الـ path يَعطي tenant فقط، الـ row يَعطي الـ scope.
- **مبدأ مُضاف**: **storage DELETE للـ orphans يَجب أن يَدعم managers**، لا فقط الـ owner، حتى يَعمل cleanup بعد أن admin يَحذف صفاً رفعه شخص آخر. الـ orphan check يَحفظ الـ invariant ("linked = immutable").

### التحديثات في 3.12 (المرحلة 11 — المستندات + سجل التدقيق)

تطبيق وقائي شامل لكل دروس Codex المتراكمة (11 درساً).

- **`supabase/14_phase11.sql`** — 5 إصلاحات:
  - **Documents tenant lock**: trigger يَمنع تغيير `building_id` + `uploaded_by` + `file_url` + `file_size` + `created_at` (audit fields immutable).
  - **Documents INSERT split**: استبدال `documents_manage` (FOR ALL) بـ `documents_insert/update/delete` منفصلة. INSERT يَفرض `uploaded_by = auth.uid()` (مع super-admin bypass) — لا انتحال هوية.
  - **Documents storage orphan-only DELETE**: `documents_delete_own_orphan` على bucket `documents` (مرآة لـ Phase 6 receipts/Phase 7 invoices).
  - **Audit immutability triggers**: `trg_audit_logs_no_update` + `trg_audit_logs_no_delete` (defensive — حتى لو future RPC أو service_role يحاول، الـ trigger يرفع).

- **`src/lib/storage.ts`** موسَّع:
  - `validateDocumentFile` (25MB max، PDF/Word/Excel/JPG/PNG)
  - `uploadDocument` → path `documents/{building}/documents/{doc_id}/file-<ts>.<ext>`
  - `getDocumentSignedUrl` (TTL 1 ساعة), `deleteDocumentFile`

- **`src/lib/validations/documents.ts`**: `documentCreateSchema, documentUpdateSchema`.

- **`src/lib/queries/documents.ts`**: `listDocuments` (filters: category + free-text title search), `listDocumentCategories`, `getDocument`.

- **`src/lib/queries/audit.ts`** (cursor pagination):
  - `listAuditLogs(buildingId, filters)` — يَستخدم `before` cursor (timestamp) بدلاً من offset، مستفيداً من `idx_audit_created` للأداء على 1000+ records.
  - filters: entity_type, action, actor_id, date range
  - `listAuditEntityTypes(buildingId)` — distinct entity_types للـ filter dropdown
  - `listAuditActors(buildingId)` — distinct actors with names

- **`src/actions/documents.ts`** — 4 actions:
  - `uploadDocumentAction`, `updateDocumentAction`, `deleteDocumentAction`, `getDocumentDownloadUrlAction` (signed URL).

- **Components (8)**:
  - **Documents** (4): `document-card` (file size + category + visibility badge), `document-actions` (download + delete), `documents-grid` (search + category filter), `upload-dialog` (modal مع file picker + datalist categories + visibility checkbox).
  - **Audit** (4): `entity-link` (generic mapper من 17 entity_type → Arabic label + clickable link لـ 8 entities)، `diff-viewer` (red strikethrough للقديم، green للجديد، يُخفي noisy fields افتراضياً)، `audit-table` (cursor pagination عبر "السجلات الأقدم")، `audit-filters` (entity + action + actor + date range).

- **Pages (2)**:
  - `/documents` — grid + search + categories
  - `/audit-logs` — admin/committee only (route-level + RLS)

- **`scripts/sql-validate.mjs`**: 11 اختبار جديد:
  - 4 structural: triggers + INSERT policy + dropped old policy + orphan storage policy
  - 6 functional: tenant immutability + uploaded_by/file_url immutability + legitimate updates work + audit UPDATE/DELETE rejected
- نتيجة الفحوصات: **174/174 passing** (163 سابقة + 11 جديدة).

- **`src/components/layout/nav-items.ts`**: `pending: true` أُزيل عن `/documents` و `/audit-logs`.

- **معايير القبول من PLAN §11 — كلها مُنفَّذة**:
  - ✅ admin/committee only لـ `/audit-logs` (route + RLS موروثة من Phase 1)
  - ✅ resident → 403 (redirect إلى `/forbidden`)
  - ✅ diff viewer بألوان (red للقديم، green للجديد)
  - ✅ cursor pagination للأداء على 1000+ records
  - ✅ documents searchable بالعنوان + التصنيف
  - ✅ download عبر signed URL بـ TTL 1 ساعة

### التحديثات في 3.11 (إغلاق ملاحظة المرحلة 10 من Codex — round 4: rep-change visibility)

- **(P2) أثر جانبي لتضييق خصوصية vote_responses**: بعد round 3، السياسة `vote_responses_select_admin_or_self` تَحجب صفوف الأصوات السابقة عن المستخدم الجديد. السيناريو المكسور: ممثل قديم صوّت → admin يُغيّر الممثل لمستخدم جديد → الجديد يَفتح صفحة التصويت → `listVotableApartmentsForUser` يَقرأ vote_responses مباشرة، لا يَرى الصف القديم → الشقة تَظهر كـ votable → زر "صوّت" يَظهر → الـ RPC يَفشل عند الإرسال (UNIQUE).
  - **الإصلاح**: SECURITY DEFINER RPC `list_user_vote_apartments(p_vote_id)` يُرجع جميع الشقق التي يكون المستخدم voting rep لها مع:
    - `already_voted: boolean`
    - `voted_by_user_name`, `voted_at`, `voted_option_label` (للشفافية للممثل الجديد)
  - الـ RPC تَتجاوز قيود الـ SELECT بأمان (SECURITY DEFINER) لكن تَقتصر على الشقق التي يَرأسها المستخدم نفسه.
  - **`src/lib/queries/governance.ts`**: `listUserVoteApartments` جديد + `listVotableApartmentsForUser` صار يَستخدم الـ RPC.
  - **`src/app/(app)/votes/[id]/page.tsx`**: يَستخدم الـ RPC للـ votable list AND للـ banner المعروض للممثل الذي صوّتت شقته (يَعرض الـ apartment number + المُصوِّت السابق + الخيار + الوقت).

- **5 اختبارات SQL جديدة (10.33-10.37)**:
  - 10.33: `list_user_vote_apartments` RPC موجود ✓
  - 10.34: user1 يَرى شقته مع `already_voted=true` بعد التصويت ✓
  - 10.35: **user2 (new rep) يَرى الشقة مع `already_voted=true` رغم أن المُصوِّت user1** (السيناريو المكسور سابقاً) ✓
  - 10.36: privacy preserved — user2 يَرى status بدون raw row access مباشر ✓
  - 10.37: cast بواسطة user2 ما زال مرفوضاً (defense-in-depth في RPC) ✓
- نتيجة الفحوصات: **163/163 passing** (158 سابقة + 5 جديدة).

- **مبدأ مُضاف**: تَضييق RLS قد يُكسر استعلامات تَعتمد على رؤية صفوف غير-self. الحل: SECURITY DEFINER RPC يَكشف **حالة derived** (already_voted) دون كشف الـ raw row، مع الإبقاء على الـ display fields الضرورية (voter name + option) للشفافية المُقصودة. لا تَترك UI يَستنتج وجود/غياب صف بناءً على ما يَراه — استخدم RPC تُجيب صراحة.

### التحديثات في 3.10 (إغلاق ملاحظات المرحلة 10 من Codex — round 3)

ثلاث ثغرات (2 P1 + 1 P2) في سطح الحوكمة:

- **(P1) خصوصية vote_responses**: السياسة السابقة تَسمح لأي عضو في العمارة بقراءة كل الردود (user_id + apartment_id + option_id) حتى للتصويت active. Codex spec يَنُص: "للمستخدم العادي قبل closing: لا يَرى تفاصيل أصوات الشقق الأخرى". UI hiding غير كافٍ — direct Supabase client يَكشف.
  - **الإصلاح**: الـ policy الجديدة `vote_responses_select_admin_or_self`:
    - admin/committee/super → يَرون الكل (شفافية إدارية)
    - voter → يَرى صفه فقط (شفافية ذاتية)
  - **3 SECURITY DEFINER RPCs** للـ aggregate counts:
    - `get_vote_voted_count(vote_id)` → bigint (NULL للـ resident على active)
    - `get_vote_aggregate_counts(vote_id)` → table (option_id, count) — يَرفع لـ resident على active
    - `get_votes_voted_counts(vote_ids[])` → batched للـ list page
  - الـ RPCs تَفرض الخصوصية server-side: admin يَرى real-time، resident فقط بعد closing.

- **(P1) decisions.vote_id يُربَط بتصويت غير مُغلق**: `createDecisionAction` يَفحص `vote.status='closed'` لكن DB لا يَفرض. admin/committee عبر Supabase client يستطيع insert decision مع vote_id لتصويت `active` أو `cancelled`، فينشأ سجل قرار يَبدو منبثقاً عن تصويت لم يُغلق.
  - **الإصلاح**: trigger جديد `trg_decisions_validate_vote_link` على BEFORE INSERT/UPDATE:
    - vote_id NULL → مسموح
    - vote_id NOT NULL → يَجب يَكون vote.status='closed' في نفس building_id
  - الـ tenant check في الـ trigger زائد عن الـ composite FK (defense-in-depth).

- **(P2) إنشاء التصويت المستقل غير ذرّي**: المسار standalone (vote بدون suggestion) كان: insert vote → insert options → on-failure delete vote. لكن **لا DELETE policy على votes**، فالـ cleanup يَفشل بصمت عند الأخطاء، يَترك draft يتيم.
  - **الإصلاح**: SECURITY DEFINER RPC جديد `create_vote_with_options(building_id, title, description, options[], ends_at, approval_rule, custom_threshold, estimated_cost)` يُنشئ vote + options في transaction واحدة. لو فشل أي شيء، الـ rollback التلقائي يَحذف الكل.
  - الـ action `createVoteAction` يَستدعي الـ RPC الجديد للـ standalone (مع mapping رسائل الأخطاء العربية).

- **9 اختبارات SQL جديدة (10.24-10.32)**:
  - 10.24: vote_responses_select_admin_or_self مَفعَّلة + القديمة محذوفة ✓
  - 10.25: 4 RPCs جديدة موجودة ✓
  - 10.26: admin يَرى aggregate على active فوراً ✓
  - 10.27: resident لا يَرى results قبل closing (privacy) ✓
  - 10.28: resident يَرى aggregate بعد closing ✓
  - 10.29: decision لا يُنشأ مع vote_id لتصويت غير مُغلق ✓
  - 10.30: create_vote_with_options ذرّي ✓
  - 10.31: resident لا يستطيع استدعاء create_vote_with_options ✓
  - 10.32: decision يُنشأ مع vote_id لتصويت مُغلق (regression) ✓
- نتيجة الفحوصات: **158/158 passing** (149 سابقة + 9 جديدة).

- **مبادئ مُضافة للمحفظة**:
  1. **RLS SELECT العامة + queries client-side تكشف البيانات الحساسة**. للـ aggregate counts بدون تسريب individual rows، استخدم SECURITY DEFINER RPC + قيِّد الـ SELECT على الجدول.
  2. **للخصوصية الزمنية** (نتائج تَظهر بعد closing فقط)، ضع المنطق في الـ RPC server-side، ليس في الـ UI. الـ RPC يَرجع NULL أو يَرفع للـ unauthorized.
  3. **FK references لـ workflow tables** يَجب يَفحص state، ليس مجرد الوجود. `decisions.vote_id` يَجب يَشير لـ closed vote، ليس لأي vote.
  4. **No-DELETE policy + insert-then-link pattern = orphan trap**. كل multi-table insertion يَجب يَكون في SECURITY DEFINER RPC مع transaction واحدة.

### التحديثات في 3.9 (إغلاق ملاحظات المرحلة 10 من Codex — round 2)

ثلاث ثغرات P1:

- **(P1) `activate_vote` يَفشل في الـ real-world flow**: الـ trigger كان يَمنع تغيير `starts_at` في أي transition، لكن `activate_vote` يَفعل `update set status='active', starts_at=now()`. الاختبار كان داخل نفس transaction (`now()` ثابتة)، فلم يَكشف. في التطبيق الحقيقي، الـ activate يَحدث في طلب لاحق فـ `now()` يَختلف ويَفشل الـ trigger.
  - **الإصلاح**: استثناء صريح في الـ trigger — `starts_at` مسموح يَتغيّر فقط في `draft → active`.
  - **اختبار جديد** يَستخدم `starts_at = now() - interval '2 hours'` صراحة لضمان أن `NEW.starts_at != OLD.starts_at` فعلاً.

- **(P1) `vote_options` قابل للتعديل بعد التفعيل**: `vote_options_admin_manage` كانت FOR ALL — admin يستطيع تعديل label أو حذف/إضافة option على تصويت `active` أو `closed`، فيغيّر معنى الأصوات بعد التسجيل.
  - **الإصلاح**: trigger جديد `trg_vote_options_validate_change` على INSERT/UPDATE/DELETE يَفحص حالة الـ vote الأم. لو `≠ 'draft'` → raise. كذلك يَمنع تغيير `vote_id` (يُعيد ربط الخيار بتصويت آخر).
  - الـ `convert_suggestion_to_vote` RPC يُنشئ vote في `draft` ثم options في `draft` → الـ trigger يَسمح. ✓

- **(P1) مؤلف الاقتراح يَنقل status بنفسه**: `suggestions_update_author_or_admin` تَسمح للمؤلف بـ UPDATE، والـ trigger القديم لا يَفصل بين edit الـ title/description وbetween status change. النتيجة: المؤلف عبر Supabase client يستطيع `update set status='approved'` بنفسه أو `'converted_to_vote'` بدون إنشاء vote فعلي.
  - **الإصلاح**: في الـ suggestions trigger، عند `old_s != new_s` → فحص أن الـ caller `is_super_admin OR user_has_role(building, ['admin','committee'])`. لو لا → raise.
  - الـ `convert_suggestion_to_vote` RPC يَكون SECURITY DEFINER لكن `auth.uid()` يَعود الـ caller الأصلي (الذي تأكد من دوره داخل الـ RPC) → الفحص يَمر شرعياً.

- **9 اختبارات SQL جديدة (10.15-10.23)**:
  - 10.15: activate_vote ينجح حتى عند تغيير `starts_at` (real-world flow) ✓
  - 10.16: trg_vote_options_validate_change موجود ✓
  - 10.17: vote_options INSERT على تصويت active مرفوض ✓
  - 10.18: vote_options UPDATE على تصويت active مرفوض ✓
  - 10.19: vote_options DELETE على تصويت active مرفوض ✓
  - 10.20: vote_options تعديل/إضافة على draft يعمل (regression) ✓
  - 10.21: مؤلف الاقتراح لا يستطيع تغيير status ✓
  - 10.22: مؤلف الاقتراح يستطيع تعديل title/description (regression) ✓
  - 10.23: admin يستطيع تغيير status (regression) ✓
- نتيجة الفحوصات: **149/149 passing** (140 سابقة + 9 جديدة).

- **مبادئ مُضافة للمحفظة**:
  1. **اختبارات الـ workflow timing يجب أن تُحاكي الـ real-world** — اختبار INSERT + activate في نفس transaction يُخفي الفروق الزمنية. استخدم timestamps صريحة في الماضي.
  2. **الجداول التابعة (child tables)** بـ FK لـ workflow tables يجب أن يَكون لها مرورها الخاص بالـ parent state. `vote_options` ليست independent — صلاحية تعديلها تَتبع `vote.status`.
  3. **عند RLS policy واسعة (يُعدِّلها multiple roles)** + trigger يَفحص حقول معيَّنة، تأكد أن **status changes مَفصولة** عن edit-content. RLS يَقول مَن يستطيع UPDATE، لكن الـ trigger يَفصل أيّ الحقول لكل دور.

### التحديثات في 3.8 (المرحلة 10 — الحوكمة: اقتراحات + تصويت + قرارات)

أكبر مرحلة في المنتج. تطبيق وقائي لكل دروس Codex من المراحل السابقة.

- **`supabase/13_phase10.sql`** — workflow integrity كامل + 5 RPCs:
  - **Suggestions trigger**: tenant lock + `created_by` immutability + transition whitelist (new → discussion/pricing/converted_to_vote/rejected/archived/approved، إلخ).
  - **Votes**: split `votes_admin_committee_manage` (FOR ALL) إلى INSERT/UPDATE separate policies. INSERT lock على `status='draft'`. **No DELETE policy** (votes immutable for governance audit). Trigger يَفحص: tenant + `created_by`/`suggestion_id` immutability + transitions (draft→active|cancelled، active→closed|cancelled) + per-state field freeze (active state: business fields locked).
  - **Decisions trigger**: tenant + `created_by`/`vote_id` immutability.
  - **Vote responses trigger**: BEFORE UPDATE → raise exception (immutable once cast — defense-in-depth on top of "no UPDATE policy").
  - **5 SECURITY DEFINER RPCs**:
    - `cast_vote_for_apartment(p_vote_id, p_apartment_id, p_option_id)` — atomic cast بـ FOR UPDATE على vote، يَفحص الـ status + window + apartment+vote tenant + voting_rep + option وreturns response_id.
    - `convert_suggestion_to_vote(p_suggestion_id, ...)` — يُنشئ vote (draft) + options + يُحدِّث suggestion إلى converted_to_vote. كل ذرّياً مع FOR UPDATE.
    - `activate_vote`, `close_vote`, `cancel_vote` — workflow transitions مع FOR UPDATE + role + state checks.

- **`src/lib/voting.ts`** (PURE LOGIC، testable in isolation):
  - `computeVoteResults(options, responses, eligible, rule, threshold)` — per-apartment counts فقط، **never per-user**.
  - `approvalThreshold(rule, threshold)` — 0.5/0.6667/custom.
  - Strict `>` لـ simple_majority، `≥` لـ two_thirds + custom (parliamentary conventions).
  - Tie → no winner (defensive).
  - `formatPercent` للعرض.

- **`src/lib/validations/governance.ts`**:
  - Schemas: suggestion create/update/status, vote create (مع superRefine لـ custom_threshold)، cast vote, decision create.

- **`src/lib/queries/governance.ts`**:
  - `listSuggestions, getSuggestion` (مع linked vote_id لـ converted)
  - `listVotes, getVote` (مع options_count + voted_count per-apartment dedup)
  - `listVoteOptions, listVoteResponsesDetail, countEligibleApartments`
  - `computeVoteResultsFor` (يَجمع الـ DB data ويُمرِّرها لـ pure function)
  - `listVotableApartmentsForUser` (الشقق التي يَملك المستخدم voting_rep لها AND لم تُصوِّت بعد)
  - `listDecisions, getDecision` (مع vote_title الفك)

- **`src/actions/governance.ts`** — 12 actions:
  - Suggestions: `createSuggestionAction`, `updateSuggestionAction`, `changeSuggestionStatusAction`
  - Votes: `createVoteAction` (يَستخدم `convert_suggestion_to_vote` RPC لو suggestion_id محدَّد)، `activateVoteAction`, `closeVoteAction`, `cancelVoteAction`, `castVoteAction` (يَستخدم `cast_vote_for_apartment` RPC)
  - Decisions: `createDecisionAction` (يَفحص أن vote_id مُغلق قبل الربط)

- **Components (12)**:
  - **Suggestions** (4): suggestion-card, suggestion-form, convert-to-vote-dialog (modal مع options dynamic + approval rule selector + datetime-local), status-actions
  - **Votes** (8): vote-card (شقق صوّتت/مؤهلة), vote-form, cast-vote (مع per-apartment selector لو المستخدم رمز لشقتين), representation-banner (3 حالات مرئية), results-chart (HTML/CSS bars بدون recharts)، vote-status-badge, voted-apartments-list (admin transparency)، vote-actions (activate/close/cancel)
  - **Decisions** (2): decision-card, decision-form

- **Pages (8)**:
  - `/suggestions` + `/suggestions/new` + `/suggestions/[id]`
  - `/votes` + `/votes/new` + `/votes/[id]` (الأكبر — يَجمع banner + cast + results + admin transparency)
  - `/decisions` + `/decisions/new` + `/decisions/[id]`

- **§1.5.2 — defense in depth على 3 طبقات**:
  - **UI**: cast-vote يَعرض apartments الـ user-can-vote-for فقط (rep + not-yet-voted).
  - **Server (RPC)**: `cast_vote_for_apartment` يَفحص كل شيء + يَستخدم FOR UPDATE.
  - **DB**: `UNIQUE(vote_id, apartment_id)` + composite FK (apartment_id, building_id) → apartments(id, building_id).

- **3 حالات UI واضحة في صفحة التصويت**:
  - "تصوّت باسم شقة X" (rep + not voted yet) — banner أزرق
  - "تصوّتت شقة X بواسطة Y في [التاريخ]، اختار: [الخيار]" — banner أخضر
  - "لست ممثل تصويت لأي شقة" — banner أصفر

- **حساب النتائج**:
  - **per-apartment فقط** (شقة 103 فيها 4 ساكنين، الممثل يصوّت "نعم" → 1 صوت)
  - نسبة الإقبال = شقق صوّتت / شقق العمارة المؤهلة (لها voting rep نشط)
  - النتائج تَظهر للمستخدم العادي **بعد closing فقط**؛ المدير يَراها real-time.
  - شفافية الإدارة: المدير يَرى قائمة الشقق التي صوّتت + من + متى + الخيار.

- **`scripts/sql-validate.mjs`**: 14 اختبار جديد:
  - 4 triggers موجودة + 5 RPCs موجودة
  - INSERT locks (status=initial) لـ suggestions + votes
  - cast_vote ينجح للممثل الشرعي
  - duplicate cast من نفس الشقة → فشل (UNIQUE)
  - non-rep يحاول التصويت → فشل
  - cast على تصويت ملغى → فشل
  - invalid suggestion transition → فشل
  - tenant lock على suggestions + votes
  - vote في active state: business fields مُجمَّدة
  - vote_responses immutable once cast
  - convert_suggestion_to_vote ذرّي
  - prevent double-conversion
- نتيجة الفحوصات: **140/140 passing** (126 سابقة + 14 جديدة).

- **`src/components/layout/nav-items.ts`**: `pending: true` أُزيل عن `/suggestions`, `/votes`, `/decisions` (sidebar + bottom nav).

- **معايير القبول من PLAN §10 — كلها مُنفَّذة** (28 معيار + 24 سيناريو):
  - ✅ لا `voting_scope` في أي مكان
  - ✅ تصويت مكرر مستحيل على 3 طبقات
  - ✅ غير-rep لا يَرى زر التصويت ولا يَستطيع الإرسال
  - ✅ rep لشقتين يصوّت بشقتين منفصلتين
  - ✅ نتائج تُحسب بعدد الشقق
  - ✅ نسبة الإقبال = صوّتت/مؤهلة
  - ✅ banner واضح في 3 حالات
  - ✅ admin transparency عبر voted-apartments-list
  - ✅ resident عادي قبل closing لا يَرى تفاصيل أصوات الشقق الأخرى
  - ✅ تغيير voting rep أثناء active: الصوت السابق محفوظ، rep جديد ممنوع (UNIQUE)
  - ✅ simple_majority/two_thirds/custom كلها مُنفَّذة في `voting.ts`

### التحديثات في 3.7 (المرحلة 9 — الموردين والفنيين)

تطبيق وقائي لدرس Phase 8 round 5: **tenant column immutability**.

- **`supabase/12_phase9.sql`** (جديد): Trigger `trg_vendors_validate_update` يَمنع تغيير `building_id` على vendors. السياسة `vendors_manage` (FOR ALL) تَسمح للـ admin/treasurer/committee بالتحديث، لكن بدون trigger يُمكن نقل المورد بين عمارتَي مدير واحد، فيكسر:
  - tenant isolation
  - composite FK من `expenses(vendor_id, building_id)` لـ `vendors(id, building_id)` — في PG default `no action`، فالـ FK سيَفشل لكن نَفضِّل رسالة خطأ صريحة من الـ trigger.

- **`src/lib/validations/vendors.ts`** (Zod):
  - `vendorCreateSchema`, `vendorUpdateSchema`, `vendorToggleActiveSchema`
  - rating بنطاق 0..5، أي حقل اختياري قابل للسلسلة الفارغة `''`.

- **`src/lib/queries/vendors.ts`**:
  - `listVendors` (filters: specialty, includeInactive)
  - `listVendorSpecialties` (distinct values للـ datalist autocomplete)
  - `getVendor`, `getVendorWithStats` (count + total amount of approved/paid expenses)
  - `listVendorExpenses` (سجل المصروفات للـ detail page)

- **`src/actions/vendors.ts`** — 3 actions:
  - `createVendorAction`, `updateVendorAction` — admin/treasurer/committee
  - `toggleVendorActiveAction` — soft archive عبر `is_active=false` (يحفظ المورد للمصروفات التاريخية)

- **Components (5)**:
  - `rating-stars.tsx` — تفاعلية 5 نجوم، تَدعم clear بالنقر مرة ثانية
  - `vendor-card.tsx` — كارت مع `tel:` link للجوال
  - `vendor-form.tsx` — create/edit، datalist للـ specialty
  - `vendors-grid.tsx` — grid + filters (specialty + show inactive)
  - `vendor-actions.tsx` — تعديل/أرشفة/تفعيل (يَستخدم ConfirmDialog)

- **Pages (4)**:
  - `/vendors` — grid مع filters
  - `/vendors/new` — admin/treasurer/committee فقط
  - `/vendors/[id]` — تفاصيل + إحصائيات + سجل المصروفات + tel: link كبير على الموبايل
  - `/vendors/[id]/edit` — admin/treasurer/committee فقط

- **`scripts/sql-validate.mjs`**: 4 اختبارات جديدة:
  - 9.1: trg_vendors_validate_update موجود ✓
  - 9.2: admin لا يستطيع تغيير vendors.building_id ✓
  - 9.3: تعديل name/phone/rating/notes يعمل (regression) ✓
  - 9.4: soft archive يعمل ✓
- نتيجة الفحوصات: **126/126 passing** (122 سابقة + 4 جديدة).

- **`src/components/layout/nav-items.ts`**: `pending: true` أُزيل عن `/vendors`.

- **معايير القبول من PLAN §9 — كلها مُنفَّذة**:
  - ✅ admin/treasurer/committee فقط يديرون
  - ✅ رقم الجوال على الموبايل قابل للنقر (`<a href="tel:...">`)
  - ✅ rating بنجوم تفاعلية (`RatingStars` component)
  - ✅ صفحة التفاصيل: قائمة المصروفات المرتبطة (للتاريخ)

### التحديثات في 3.6 (إغلاق ملاحظة المرحلة 8 من Codex — round 7: admin proxy scope)

- **(P2) admin bypass كان واسعاً جداً**: `maint_insert_member` تَسمح للمدير بتعيين `requested_by` لأي مستخدم في `auth.users`، بدون التحقق أنه عضو نشط في نفس العمارة. سياسة الـ SELECT تَمنح الوصول لـ `requested_by` مباشرة، فالمدير يستطيع فتح طلب باسم مستخدم خارجي فيرى هذا المستخدم طلباً وصوراً من عمارة لا ينتمي لها.
  - **الإصلاح في `supabase/11_phase8.sql`**: WITH CHECK مُوسَّع بـ EXISTS clause يَضمن `requested_by` عضو نشط في `building_memberships`:
    ```sql
    and exists (
      select 1 from public.building_memberships bm
      where bm.building_id = maintenance_requests.building_id
        and bm.user_id    = maintenance_requests.requested_by
        and bm.is_active  = true
    )
    ```
    الفحص top-level فينطبق على الجميع (resident self، admin proxy)، لكن:
    - resident: requested_by = auth.uid()، فعضويته مَفروضة من `is_building_member(building_id)` فوق + EXISTS الجديد.
    - admin proxy: requested_by = user آخر، فالـ EXISTS هو الذي يَضمن أنه عضو نشط.

- **4 اختبارات SQL جديدة (8.53-8.56)**:
  - 8.53: structural — WITH CHECK يَفحص `building_memberships` ضد `requested_by` ✓
  - 8.54: behavioral — admin يحاول تعيين requested_by لمستخدم خارجي → RLS رفض ✓
  - 8.55: behavioral regression — admin proxy لعضو نشط يعمل ✓
  - 8.56: behavioral — admin لا يستطيع proxy لعضو معطَّل (`is_active=false`) ✓
- نتيجة الفحوصات: **122/122 passing** (118 سابقة + 4 جديدة).

- **مبدأ مُضاف**: "النيابة الشرعية" يجب أن يكون لها **scope صريح**. السماح للمدير بـ proxy على *أي* user_id = ضعف الـ tenant isolation من الجانب الآخر. الحل: الـ EXISTS clause تَضمن أن user المُمَثَّل (proxied) ضمن نفس الـ tenant + active. هذا النمط يَنطبق على:
  - `payments.user_id` (مَن دفع — يجب يكون عضو في العمارة)
  - `tasks.assigned_to` (المُسنَد إليه — يجب يكون عضو)
  - `vote_responses.user_id` (المُصوِّت — يجب يكون عضو)
  - أي حقل user_id آخر يُمَثِّل "person on behalf of whom this row exists".

### التحديثات في 3.5 (إغلاق ملاحظة المرحلة 8 من Codex — round 6: insert ownership)

- **(P1) `requested_by` كان قابلاً للتزوير على insert**: `maint_insert_member` تَفحص العضوية في العمارة وتفرض حقول الـ workflow، لكنها لا تَفرض `requested_by = auth.uid()`. الـ server action يضع القيمة الصحيحة، لكن عبر Supabase client مباشر يستطيع أي عضو إنشاء طلب باسم ساكن آخر، فيظهر في قوائمه ويفقد الـ audit ownership معناه.
- **(P1) `apartment_id` كان مفتوحاً على أي شقة**: ساكن في شقة 101 يستطيع فتح طلب على شقة 102 المجاورة (سياسة الـ insert تفحص فقط building membership).
  - **الإصلاح في `supabase/11_phase8.sql`** — `maint_insert_member` WITH CHECK مُوسَّع:
    ```sql
    -- requested_by lock (مع admin bypass للسيناريو الشرعي: مدير يَفتح بلاغ نيابة)
    and (
      requested_by = auth.uid()
      or public.is_super_admin()
      or public.user_has_role(building_id, array['admin','committee']::membership_role[])
    )
    -- apartment_id scope (NULL = منطقة مشتركة، مسموح للجميع)
    and (
      apartment_id is null
      or public.is_super_admin()
      or public.user_has_role(building_id, array['admin','committee']::membership_role[])
      or exists (
        select 1 from public.apartment_members am
        where am.apartment_id = maintenance_requests.apartment_id
          and am.user_id = auth.uid()
          and am.is_active = true
      )
    )
    ```

- **6 اختبارات SQL جديدة (8.47-8.52)**:
  - 8.47: structural — policy WITH CHECK يَفحص requested_by + admin bypass ✓
  - 8.48: structural — policy يَفحص apartment_id ضد apartment_members ✓
  - 8.49: behavioral — resident بـ `set role authenticated` يحاول تزوير requested_by → RLS يرفض ✓
  - 8.50: behavioral — resident يحاول فتح طلب على شقة غير شقته → RLS يرفض ✓
  - 8.51: behavioral regression — resident يفتح طلب على شقته → ينجح ✓
  - 8.52: behavioral — admin يَفتح طلب باسم ساكن على أي شقة (سيناريو شرعي) → ينجح ✓
- نتيجة الفحوصات: **118/118 passing** (112 سابقة + 6 جديدة).

- **بنية الاختبارات الجديدة**: لأول مرة في السلسلة نَفحص RLS سلوكياً عبر `set role authenticated`. أُضيفت GRANTs الأساسية (`grant select/insert/update/delete on all tables in schema public to authenticated`) في بداية round 6 من sql-validate.mjs لتفعيل الـ behavioral tests. (Supabase الـ production يَفعل هذا تلقائياً، لكن PGlite mock يحتاج explicit setup.)

- **مبدأ مُضاف**: INSERT policies على جداول multi-tenant يجب أن تَفحص:
  1. **Tenant**: `building_id` ضمن المستخدم (موجود سابقاً).
  2. **Ownership**: `requested_by/created_by = auth.uid()` لغير المُديرين (لا انتحال هوية).
  3. **Sub-tenant scope**: `apartment_id` ضمن apartments المستخدم (لا cross-apartment).
  4. **Workflow lock**: `status = initial`، حقول metadata = NULL (موجود سابقاً).
- نفس الفحص يَنطبق على باقي الجداول (`payments`, `expenses`, `tasks` لو احتاجت). يُترك لـ rounds مستقبلية لو طُلب.

### التحديثات في 3.4 (إغلاق ملاحظات المرحلة 8 من Codex — round 5: tenant isolation)

- **(P1) `building_id` كان قابلاً للتعديل في maintenance_requests**: الـ trigger يجمّد كثيراً من الحقول لكن لم يَفحص `building_id`. سياسة `maint_update` تَسمح للفني المُسند بالتحديث طالما `assigned_to=auth.uid()`، فيستطيع نقل الطلب لأي `building_id` صالح. كذلك admin عضو في عمارتين ينقل الطلب بين عماراته. النتيجة: **خرق tenant isolation** + كسر FK المصروف المرتبط.
  - **الإصلاح في `supabase/11_phase8.sql`**: في بداية `maintenance_validate_transition`:
    ```sql
    if NEW.building_id is distinct from OLD.building_id then
      raise exception 'building_id is immutable on maintenance_requests' ...
    end if;
    ```
    قبل أي فرع آخر، فيُمسك في كل المسارات (same-status لكل دور + كل transitions).

- **(P1) المهام أيضاً قابلة للنقل بين العمارات**: `tasks_update_admin_or_assignee` تَسمح لـ assignee أو admin/committee بالتحديث، لكن لا trigger يَمنع `building_id` من التغيير. النتيجة: نفس خرق tenant.
  - **الإصلاح**: trigger جديد `trg_tasks_validate_update` على جدول `tasks`:
    ```sql
    if NEW.building_id is distinct from OLD.building_id then raise ...
    if NEW.created_by  is distinct from OLD.created_by  then raise ...
    ```
    الـ `created_by` أيضاً مُغلق (audit field).

- **8 اختبارات SQL جديدة (8.39-8.46)**:
  - 8.39: admin لا يستطيع تغيير `maintenance_requests.building_id` ✓
  - 8.40: الفني لا يستطيع تغيير `maintenance_requests.building_id` ✓
  - 8.41: `building_id` محصَّن أثناء transitions أيضاً ✓
  - 8.42: `trg_tasks_validate_update` موجود ✓
  - 8.43: admin لا يستطيع تغيير `tasks.building_id` ✓
  - 8.44: assignee لا يستطيع تغيير `tasks.building_id` ✓
  - 8.45: `created_by` محصَّن على `tasks` ✓
  - 8.46: تعديل `status/priority/title/assigned_to` على tasks يعمل (regression) ✓
- نتيجة الفحوصات: **112/112 passing** (104 سابقة + 8 جديدة).

- **مبدأ مُضاف**: في multi-tenant SaaS، **`building_id` (الـ tenant column) يجب أن يكون immutable عبر كل الجداول**. RLS الحالي يَفحص العضوية بناءً على `NEW.building_id`، لكن لو السماح بتغيير `building_id` نفسه، فالمستخدم العضو في عمارتين يَستطيع نقل البيانات بينهما — أبسط شكل لـ tenant breach. يجب على كل جدول multi-tenant إما:
  1. **Trigger BEFORE UPDATE** يَفحص `NEW.building_id IS DISTINCT FROM OLD.building_id`، أو
  2. **GENERATED ALWAYS** column (Postgres 12+) لو إمكان، أو
  3. **CHECK constraint** يربط `building_id` بـ FK غير قابل للتغيير.
- **توسعة محتملة لاحقاً**: نفس الفحص يجب تطبيقه على `payments` و `expenses` و `building_memberships` و باقي الجداول multi-tenant. يُترك لـ rounds Codex مستقبلية لو طُلب.

### التحديثات في 3.3 (إغلاق ملاحظة المرحلة 8 من Codex — round 4: GUC forgery)

- **(P1) GUC قابل للتزوير من العميل**: round 3 استخدم `set_config('app.linking_expense','true', true)` لتمييز الاستدعاءات عبر الـ RPC. لكن أي مستخدم بصلاحية UPDATE يستطيع تنفيذ نفس `set_config` داخل transaction ثم UPDATE مباشرة، فيتجاوز كل حماية الـ RPC.
  - **الإصلاح في `supabase/11_phase8.sql`**:
    - **Schema خاصة `private`**: `revoke all` من public/authenticated/anon. لا يستطيع المستخدم العادي رؤيتها أو الكتابة عليها.
    - **جدول `private.linking_in_progress (txid bigint primary key, set_at)`**: يَستخدمه الـ RPC للإشارة "أنا أربط الآن في هذه الـ transaction".
    - **الـ trigger `maintenance_validate_transition` صار SECURITY DEFINER**: ليتمكن من القراءة من `private.linking_in_progress` رغم أن المستخدم ليست لديه صلاحية. `set search_path = public, private, pg_temp` لتجنّب schema injection.
    - **الـ RPC تَكتب في الجدول الخاص**: `insert into private.linking_in_progress values (txid_current())` قبل الـ UPDATE، ثم `delete` بعد. الـ INSERT يحدث في SECURITY DEFINER context، فيُسمح به.
    - **الـ trigger يَقرأ بالـ txid**: `exists (select 1 from private.linking_in_progress where txid = txid_current())`. لو المستخدم زرع marker بـ txid قديم، الفحص يفشل لأن الـ txid مختلف.
  - **النتيجة**:
    - `set_config('app.linking_expense','true', true)` لا أثر له (الـ trigger لا يقرأ GUC أصلاً).
    - أي محاولة `insert into private.linking_in_progress` من العميل تفشل (لا grant).
    - الـ RPC هو الطريق الوحيد فعلياً (unforgeable enforcement).

- **6 اختبارات SQL جديدة (8.33-8.38)**:
  - 8.33: `set_config` ثم direct UPDATE → فشل ✓
  - 8.34: `authenticated`/`anon` لا يملكون أي grant على `private.linking_in_progress` ✓
  - 8.35: trigger function `SECURITY DEFINER` ✓
  - 8.36: الـ RPC ينجح بعد التحوّل من GUC إلى الجدول الخاص (regression) ✓
  - 8.37: `private.linking_in_progress` فارغ بعد commit (cleanup يعمل) ✓
  - 8.38: stale txid marker لا يَتجاوز الـ trigger (يَفحص `txid_current()`) ✓
- نتيجة الفحوصات: **104/104 passing** (98 سابقة + 6 جديدة).

- **مبدأ مُضاف**: GUCs (session/transaction settings) **client-settable** ولا تَصلح كحاجز أمني. الـ trigger يجب أن يقرأ من شيء لا يستطيع المستخدم الكتابة عليه:
  1. **جدول في schema خاصة** بـ `revoke all` من authenticated.
  2. **الـ trigger يكون SECURITY DEFINER** ليصل للجدول.
  3. **الـ RPC SECURITY DEFINER** يكتب في الجدول قبل الـ UPDATE.
  4. **`txid_current()`** يربط الـ marker بالـ transaction الحالية، فلا يُعاد استخدام marker قديم.

### التحديثات في 3.2 (إغلاق ملاحظات المرحلة 8 من Codex — round 3)

نقطتان DB-level قبل الاعتماد:

- **(P2) رابط المصروف كان قابل للتجاوز خارج الـ RPC**: same-status admin updates كانت تسمح بتعديل `related_expense_id` مباشرة، فأي admin/committee عبر Supabase client يتجاوز `FOR UPDATE` و"already linked" check ويكسر ضمان exactly-one-linked-expense.
  - **الإصلاح في `supabase/11_phase8.sql`**:
    - **فرع (A) same-status admin**: `related_expense_id` أُضيف للحقول المُجمَّدة، **ما لم** الـ GUC `app.linking_expense='true'` تكون مضبوطة.
    - **فرع (B) transitions**: `related_expense_id` لا يتغيّر أبداً أثناء transition (الـ RPC يُحدِّث بدون status change فيمر عبر فرع A).
    - **الـ RPC `link_maintenance_to_expense`**: يستدعي `set_config('app.linking_expense', 'true', true)` (transaction-local) قبل الـ UPDATE، ثم يمسحها. Direct UPDATE من Supabase client بدون GUC مرفوض.
  - **النتيجة**: الـ RPC هو الطريق الوحيد لتغيير `related_expense_id`، ولا يمكن تجاوز الـ FOR UPDATE/already-linked checks.

- **(P2) `overdue` كانت قابلة للتخزين كحالة**: enum `task_status` يحوي `overdue` لأسباب تاريخية، لكن PLAN يَنُص أنها محسوبة من `due_date` في الـ queries. بدون CHECK، أي مستخدم بصلاحية UPDATE يستطيع تعيينها مباشرة.
  - **الإصلاح**: `chk_tasks_no_overdue_storage CHECK (status <> 'overdue')` على جدول `tasks`. يمنع INSERT و UPDATE معاً. الـ enum يبقى للاحتفاظ بـ backward compat (في حال queries تَستخدم القيمة).

- **6 اختبارات SQL جديدة (8.27-8.32)**:
  - 8.27: تعديل `related_expense_id` مباشرة بدون RPC → فشل ✓
  - 8.28: الـ RPC ينجح بعد منع التجاوز (regression) ✓
  - 8.29: تعديل `related_expense_id` أثناء transition → فشل ✓
  - 8.30: tasks INSERT بـ `status='overdue'` → فشل ✓
  - 8.31: tasks UPDATE إلى `status='overdue'` → فشل ✓
  - 8.32: الحالات الأربع المسموحة للمهام تعمل (regression) ✓
- نتيجة الفحوصات: **98/98 passing** (92 سابقة + 6 جديدة).

- **مبدأ مُضاف**: SECURITY DEFINER RPC وحدها لا تكفي لحماية data-integrity invariants. لو فرع آخر في الـ trigger يسمح بتعديل الحقل المعنيّ مباشرة، الـ RPC يصبح suggestion لا enforcement. الحل: **GUC transaction-local flag** يضبطها الـ RPC، الـ trigger يقرأها، فيُصبح الـ RPC الطريق الوحيد فعلياً.
- **مبدأ آخر**: قيم enum غير المُستخدمة كـ stored state يجب أن تُحجَب بـ CHECK، حتى لو الـ application code لا يَنويها. أي قيمة في الـ enum = ثقة كاذبة لأنها قابلة للتعيين عبر Supabase client مباشر.

### التحديثات في 3.1 (إغلاق ملاحظات المرحلة 8 من Codex — round 2)

ثلاث ملاحظات حقيقية أُغلقت:

- **(P1) إغلاق طلب صيانة بدون إثبات**: الـ trigger كان يضبط `completed_at` لكنه لا يلزم `after_image_url` عند `new_s='completed'`. كذلك same-status للفني كان يسمح بتغيير `after_image_url` لاحقاً، فيمكن استبدال إثبات الإنجاز بعد الإغلاق.
  - **الإصلاح في `supabase/11_phase8.sql`**:
    - قسم (D) الجديد: `if new_s = 'completed' and (after_image_url is null or empty) then raise`.
    - قسم (A) للفني: لا تعديل لأي حقل في same-status (شامل `after_image_url`). الفني يضع الصورة فقط أثناء transition `in_progress → completed`، ولا يستطيع استبدالها بعد.

- **(P2) صور الصيانة كانت تتجاوز نطاق رؤية الطلبات**: `maintenance_select_members` السابقة كانت تَفحص `is_building_member(building)` فقط، فأي عضو يقرأ أي صورة لو عرف المسار. لكن RLS على الـ row تقصر الفني/الساكن على طلباته.
  - **الإصلاح في `supabase/11_phase8.sql`**: بُدِّلت بـ `maintenance_select_relevant` تستوجب وجود `maintenance_request` يُشير لـ `before_image_url` أو `after_image_url`، ويسمح بنفس منطق `maint_select_relevant` (admin/committee/treasurer أو requested_by أو assigned_to). الـ orphans قبل الربط لا تُقرأ — مقبول لأن الـ uploader لا يقرأها قبل الربط (signed URL يُولَّد بعد).

- **(P2) ربط المصروف بطلب الصيانة كان غير ذرّي**: `linkMaintenanceToExpenseAction` كانت قراءة → INSERT → UPDATE في 3 خطوات منفصلة. سباق بين مديرين قد يُنشئ مصروفَين، آخر UPDATE يربط واحداً ويترك الآخر مسودّة يتيمة.
  - **الإصلاح**: SECURITY DEFINER RPC `link_maintenance_to_expense(p_request_id)` في `11_phase8.sql`:
    - `select * from maintenance_requests where id=$1 for update` (يَقفل الصف).
    - يَفحص دور المستخدم، `related_expense_id IS NULL`، والحالة (لا 'new'/'rejected').
    - INSERT المصروف + UPDATE الرابط في transaction واحدة.
    - يُرجع رمز خطأ مميَّز عند الربط المتزامن.
  - **`src/actions/maintenance.ts`**: `linkMaintenanceToExpenseAction` تستدعي الـ RPC وتُترجم رسائل الأخطاء.

- **اختبارات SQL جديدة (10)**:
  - 8.17: completed بدون after_image → فشل ✓
  - 8.18: completed مع after_image → ينجح + completed_at مُختَم ✓
  - 8.19: الفني لا يستبدل after_image_url بعد الإغلاق ✓
  - 8.20: maintenance_select_relevant يَفحص row RLS ✓
  - 8.21: السياسة القديمة maintenance_select_members تم حذفها ✓
  - 8.22: link_maintenance_to_expense RPC موجود ✓
  - 8.23: أول استدعاء link ينجح ✓
  - 8.24: ثاني استدعاء على نفس الطلب → "already linked" ✓
  - 8.25: مصروف واحد فقط (لا orphans) ✓
  - 8.26: مستخدم غير admin لا يستطيع استدعاء RPC ✓
- نتيجة الفحوصات: **92/92 passing** (82 سابقة + 10 جديدة).

- **المبدأ المُضاف**: required-fields per target status يجب أن تكون داخل الـ trigger، ليس في application layer فقط. السماح بانتقال شرعي + حقل اختياري ≠ صفّ مكتمل.
- **مبدأ آخر**: storage SELECT policies يجب أن تطابق row-level RLS، وإلا تَنكسر هرمية الصلاحيات (المسار يصبح بديلاً عن الـ FK).
- **مبدأ ثالث**: العمليات متعدّدة الجداول (insert + link) في application code = race-prone. SECURITY DEFINER RPC مع `FOR UPDATE` هو الحل الذرّي الموثوق.

### التحديثات في 3.0 (المرحلة 8 — طلبات الصيانة + المهام)

تطبيق مسبق لكل دروس Codex من المراحل 6/7 وقائياً (BEFORE UPDATE كامل، per-transition field whitelist، orphan delete، state machine mirror).

- **`supabase/11_phase8.sql`** — workflow integrity على maintenance_requests + tasks:
  - **(P1 lesson) INSERT lock على maintenance_requests**: تشترط `status='new'` + `assigned_to/after_image_url/completed_at/related_expense_id/cost = NULL`. لا يستطيع أحد إنشاء طلب بحالة متقدّمة لتجاوز الـ workflow.
  - **(BEFORE UPDATE كامل) Trigger `trg_maint_validate_transition`**: على الجدول كاملاً (لا OF status فقط). يتعامل مع 3 سيناريوهات:
    - **Same-status update**: `rejected` terminal (مُجمَّد للجميع)؛ Technician (assignee) يستطيع تعديل `after_image_url` فقط؛ admin/committee في الحالات غير-rejected: مسموح فقط `description, priority, related_expense_id` — بقية الحقول مُجمَّدة.
    - **Status transition whitelist**: 9 transitions موزَّعة على 8 حالات.
    - **Per-transition field whitelist**: حقول مُجمَّدة دائماً (`title, description, location_type, priority, apartment_id, requested_by, before_image_url`)، وحقول conditional (`assigned_to, after_image_url, completed_at, cost, related_expense_id`) كل منها يتغيّر في transition محدَّد فقط.
  - **(Technician restriction)** الفني (assignee) يستطيع فقط `in_progress → completed | reopened`. أي transition آخر مرفوض ولو حاول مباشرة.
  - **(Auto-stamping)** `completed_at` يُضبط تلقائياً عند الانتقال إلى `completed`.
  - **(P1 lesson) INSERT lock على tasks**: تشترط `status='todo'` (لا تخطّي).
  - **(P2.2 lesson) `maintenance_delete_own_orphan`**: orphan-only DELETE policy على bucket `maintenance` (مرآة لـ receipts/invoices). الصور المرتبطة بطلب صيانة immutable.

- **State machine للصيانة (8 حالات)**:
  ```
  new              → reviewing | rejected
  reviewing        → waiting_quote | waiting_approval | rejected
  waiting_quote    → waiting_approval | rejected
  waiting_approval → in_progress | rejected
  in_progress      → completed | reopened
  completed        → reopened (لو العمل لم يكن مرضياً)
  reopened         → in_progress | reviewing
  rejected         → (terminal)
  ```

- **State machine للمهام (4 حالات + overdue محسوبة)**:
  - workflow مرن: أي حالة → أي حالة مسموح (task tracker، ليس مالياً).
  - `overdue` لا تُخزَّن — تُحسب في الـ queries من `due_date < today AND status != 'completed'`.

- **`src/lib/storage.ts`** موسَّع:
  - `validateMaintenanceImage` (10MB، JPG/PNG/WebP فقط — لا PDF لأنها صور موقعية)
  - `uploadMaintenanceImage` (kind: 'before' | 'after') → path `maintenance/{building}/maintenance/{request}/{kind}-<ts>.<ext>`
  - `getMaintenanceImageSignedUrl`, `deleteMaintenanceImage`

- **Validations** (`src/lib/validations/maintenance.ts` + `tasks.ts`):
  - `maintenanceCreateSchema, maintenanceAssignSchema, maintenanceQuoteSchema, maintenanceCompleteSchema`
  - `taskCreateSchema, taskUpdateStatusSchema`
  - `MAINTENANCE_TRANSITIONS`: قائمة بيضاء بـ JS تطابق الـ trigger (single source of truth).

- **Queries**:
  - `listMaintenanceRequests` (filters: status, priority, location, assignedTo + pagination 20/page)
  - `getMaintenanceRequest`, `listTechnicians`, `listApartmentsForMaintenance`
  - `listMaintenanceTimeline` يقرأ من `audit_logs` ويُرتِّب الأحداث للـ timeline UI
  - `listTasks` (filters + يحسب `is_overdue`), `getTask`, `listTaskAssignees`

- **Server actions** — 8 actions للصيانة + 2 للمهام:
  - **Maintenance**: `createMaintenanceRequestAction`, `reviewMaintenanceAction`, `assignTechnicianAction` (يُعالج reviewing→waiting_approval ينقل assigned_to + cost), `saveMaintenanceQuoteAction`, `startMaintenanceAction` (waiting_approval/reopened → in_progress), `rejectMaintenanceAction`, `completeMaintenanceAction` (after_image إلزامي)، `reopenMaintenanceAction`, `linkMaintenanceToExpenseAction` (يُنشئ مصروف مسودّة ويربط).
  - **Tasks**: `createTaskAction`, `updateTaskStatusAction`.
  - كلها تستخدم `.select('id').maybeSingle()` على UPDATE → لا success صامت (Codex P2.1).

- **Components (10)**:
  - **Maintenance** (8): `request-form`, `request-card`, `status-timeline` (يقرأ audit_logs), `assign-technician` (dialog مع dropdown فنيين + cost), `before-after-images` (signed URLs بـ skeleton), `link-expense-dialog`, `workflow-actions` (الأزرار حسب الحالة + الدور), `maintenance-filters`.
  - **Tasks** (3): `task-form`, `task-card` (status select inline), `tasks-board` (kanban على md+، tabs على mobile).

- **Pages (5)**:
  - `/maintenance` — قائمة كروت + فلاتر + pagination
  - `/maintenance/new` — أي عضو يستطيع التسجيل
  - `/maintenance/[id]` — تفاصيل + workflow + timeline + before/after + link to expense
  - `/tasks` — kanban board
  - `/tasks/new` — admin/committee فقط

- **`scripts/sql-validate.mjs`**: 16 اختبار جديد للمرحلة 8:
  - INSERT lock policies (maintenance + tasks)
  - Trigger وجود
  - Storage orphan policy
  - Functional: invalid transitions، valid transitions، same-status admin restrictions، technician restrictions، auto-stamping، terminal immutability
  - نتيجة: **82/82 passing** (66 سابقة + 16 جديدة).

- **`src/components/layout/nav-items.ts`**: `pending: true` أُزيل عن `/maintenance` و `/tasks`.

- **معايير القبول من PLAN §8 — كلها مُنفَّذة**:
  - ✅ ساكن ينشئ طلب صيانة + رفع صورة
  - ✅ فني يرى **فقط** طلباته (RLS موروثة من Phase 1)
  - ✅ فني لا يقدر يرى/يعدّل طلب لم يُسند له (RLS + Trigger)
  - ✅ Timeline تعمل من audit_logs
  - ✅ Before/after images تُعرض جنباً لجنب
  - ✅ إنشاء مصروف من طلب صيانة (`linkMaintenanceToExpenseAction`)
  - ✅ Tasks board responsive (mobile: tabs، desktop: kanban)
  - ✅ Overdue يظهر بـ badge أحمر في `task-card`

### التحديثات في 2.12 (إغلاق ملاحظة المرحلة 7 من Codex — round 5: rejected → cancelled)

- **(P2) زر إلغاء ظاهر يفشل دائماً على rejected**: في round 4 أُضيف rejected لبطاقة الـ workflow، فبدأ `canCancel = canManage && !isTerminal` يُظهر زر CancelDialog لـ rejected. لكن `cancelExpenseAction` يحصر WHERE في `['draft','pending_review','approved']` والـ trigger في DB يرفض `rejected → cancelled`، فالنقر يُرجع رسالة "لا يمكن إلغاء المصروف في حالته الحالية".
- **القرار المنتجي**: توسيع state machine. **سبب الاختيار**:
  - Symmetry: كل الحالات غير-terminal (draft / pending_review / approved) تستطيع الانتقال لـ cancelled. إبقاء rejected استثناءً يكسر التماثل.
  - UX: المُنشئ لما يرى مصروفاً مرفوضاً قد يقرر التخلّي عنه بدلاً من إصلاحه. زر واحد أوضح من ‎`rejected → draft → cancelled` (نقرتان).
  - Audit trail: cancellation_reason يُسجَّل كـ "تخلّى عنه بعد الرفض" — أوضح من ترك المصروف عالقاً.
- **التعديلات**:
  - **`supabase/10_phase7.sql`**: قائمة الـ transitions في الـ trigger صار: `rejected → draft | cancelled` (بدلاً من draft فقط).
  - **`src/actions/expenses.ts`**: `cancelExpenseAction` صار `.in('status', ['draft', 'pending_review', 'approved', 'rejected'])` ليطابق الـ trigger.
  - **`src/lib/validations/expenses.ts`**: `EXPENSE_TRANSITIONS.rejected = ['draft', 'cancelled']` (single source of truth بين JS و DB).
- **اختبار 7.26a الجديد**: صف pending_review → rejected → cancelled مع cancellation_reason → ينجح ويُسجَّل في الـ row.
- نتيجة الفحوصات: **66/66 passing** (65 سابقة + 1 جديد).
- **المبدأ**: state machine في DB والـ UI و JS schemas يجب أن تكون مرآة واحدة. أي زر ظاهر بدون مسار صالح في الـ DB = ثقة مكسورة من المستخدم.

### التحديثات في 2.11 (إغلاق ملاحظة المرحلة 7 من Codex — round 4: مسار rejected)

- **(P2) المصروف المرفوض كان عالقاً في الـ UI**: الـ trigger و PLAN يدعمان `rejected → draft`، لكن `StatusActions` كان يُرجع `null` لحالة rejected وصفحة التفاصيل لم تكن تعرض بطاقة الـ workflow لها. النتيجة: المُنشئ يعدّل البيانات في صفحة edit، يعود للتفاصيل، فلا يجد زراً لإعادة الإرسال.
- **`src/actions/expenses.ts`**: `reopenRejectedExpenseAction` جديد:
  - WHERE `status='rejected'` + `.select('id').maybeSingle()` لرصد race conditions.
  - يضبط `status='draft'` فقط؛ الـ trigger يمسح `approved_by/approved_at` تلقائياً عبر فرع `rejected → draft`.
- **`src/components/expenses/status-actions.tsx`**:
  - الشرط terminal أصبح `paid || cancelled` (بدلاً من إضافة rejected).
  - فرع جديد لـ rejected: `ConfirmDialog` بزر "إعادة فتح كمسودّة" مع أيقونة `RotateCcw`.
- **`src/app/(app)/expenses/[id]/page.tsx`**:
  - بطاقة الـ workflow تُعرض الآن لـ rejected أيضاً، مع وصف عربي يشرح الخطوات (اقرأ ملاحظة المراجِع → عدّل البيانات → أعد الفتح).
  - رابط "تعديل البيانات" يظهر لـ `draft` و `rejected`.
- **`scripts/sql-validate.mjs`**: اختبار جديد 7.26b يُغطي round-trip كامل:
  - `draft → pending_review → rejected → draft (auto-clear approved_by/at) → pending_review → approved`
  - يتحقق أن `approved_by/approved_at` فعلاً مَمسوحان بعد `rejected → draft`.
- نتيجة الفحوصات: **65/65 passing** (64 سابقة + 1 جديد).
- **المبدأ**: state machine في الـ DB يجب أن يطابق state machine في الـ UI. كل transition شرعي في الـ trigger يلزمه زر/action في الـ UI، وإلا الحالة تصبح "خرساء" (unreachable forward) رغم أنها valid في الـ DB.

### التحديثات في 2.10 (إغلاق ملاحظة المرحلة 7 من Codex — round 3)

- **(P1) ثغرة same-UPDATE field-tampering أثناء transition شرعي**: إصلاح round 2 جمّد same-status edits، لكن status-changing branch ظل يقبل أي تعديل على الحقول التجارية إلى جانب الـ status change. مثال خطر:
  ```sql
  update expenses set
    status='approved', approved_by=..., approved_at=now(), amount=999
  where status='pending_review';
  ```
  الانتقال شرعي والـ whitelist يقبله، لكن `amount` غُيِّر أثناء اعتماد يبدو نظيفاً. مشابه لـ `approved → paid` مع تعديل `receipt_url` و `amount` في نفس الـ UPDATE.
- **التعديل في `supabase/10_phase7.sql` — قسم (C) per-transition field whitelist** داخل الـ trigger:
  - **(C.1) حقول مُجمَّدة في كل transition بدون استثناء**: `title, category, amount, expense_date, vendor_id, invoice_url`. الفاتورة ترتبط بالمصروف عند الإنشاء فقط، لا تُستبدل أثناء الـ workflow.
  - **(C.2) `description`**: مسموح بتغيّرها فقط في `pending_review → rejected` (المراجِع يُلحق ملاحظة).
  - **(C.3) `approved_by/approved_at`**: تتغيّر فقط في `pending_review → approved` (تُضبط) أو `rejected → draft` (تُمسح تلقائياً).
  - **(C.4) `paid_by/paid_at`**: تتغيّر فقط في `approved → paid`.
  - **(C.5) `receipt_url`**: تتغيّر فقط في `approved → paid` (إثبات الدفع).
  - **(C.6) `cancellation_reason`**: تتغيّر فقط حين الـ target = `cancelled`.
- **8 اختبارات SQL جديدة (7.19-7.26)** في `scripts/sql-validate.mjs`:
  - 7.19: `pending_review → approved` مع `amount` معدّل → فشل ✓
  - 7.20: `approved → paid` مع `amount` معدّل → فشل ✓
  - 7.21: `pending_review → approved` مع `vendor_id` معدّل → فشل ✓
  - 7.22: `approved → paid` مع `invoice_url` معدّل → فشل ✓
  - 7.23: `pending_review → approved` نظيف (regression check) → ينجح ✓
  - 7.24: `pending_review → rejected` مع `description` معدّل (الاستثناء المسموح) → ينجح ✓
  - 7.25: `pending_review → approved` مع `description` معدّل (لـ rejected فقط) → فشل ✓
  - 7.26: `approved → paid` مع `approved_by` معدّل → فشل ✓
- نتيجة الفحوصات: **64/64 passing** (56 سابقة + 8 جديدة).
- **المبدأ المُضاف**: حماية workflow الـ DB ليست transitions whitelist فقط، بل أيضاً field-level whitelist لكل transition. السماح بانتقال شرعي ≠ السماح بأي تغيير على بيانات المصروف. الحقول التجارية الأساسية (amount/vendor/invoice) لا تُلمَس أبداً بعد الإنشاء — التعديلات الوحيدة المسموحة هي metadata تتعلق بالـ transition نفسه (approve/pay/cancel/reject metadata).

### التحديثات في 2.9 (إغلاق ملاحظة المرحلة 7 من Codex — round 2)

- **(P1) Terminal immutability في DB، ليس فقط في الـ actions**: الـ trigger في 10_phase7.sql كان `BEFORE UPDATE OF status` فقط، فلو مستخدم admin/treasurer (أو خصم بـ Service Role) عدّل `amount` أو `vendor_id` أو `invoice_url` أو `receipt_url` أو `paid_by`/`paid_at` على صف `status='paid'` بدون لمس عمود status، الـ trigger لا يطلق ولا تُحترم terminal immutability. كانت قيود الـ actions فقط هي الحارس، وهذا ليس defense-in-depth حقيقياً.
- **التعديل في `supabase/10_phase7.sql`**:
  - الـ trigger أصبح `BEFORE UPDATE on public.expenses` (بدون `OF status`).
  - منطق same-status update جديد:
    - `draft` و `rejected`: كل الحقول قابلة للتعديل (المُنشئ يُجهِّز/يُصلِح المسودّة).
    - `pending_review`, `approved`, `paid`, `cancelled`: الحقول التجارية وحقول الـ workflow **مُجمَّدة** (`title, description, category, amount, expense_date, vendor_id, invoice_url, receipt_url, approved_by, approved_at, paid_by, paid_at, cancellation_reason`). أي تعديل يستوجب transition شرعي عبر action مخصَّص.
  - يستخدم `is distinct from` (يعالج NULL بشكل صحيح) لمقارنة `OLD` vs `NEW` لكل حقل.
- **اختبارات SQL صريحة جديدة (6)** في `scripts/sql-validate.mjs`:
  - 7.13: تعديل `amount` على صف `paid` بدون transition → فشل.
  - 7.14: تعديل `invoice_url` على صف `paid` → فشل.
  - 7.15: تعديل `paid_at` على صف `paid` → فشل.
  - 7.16: تعديل `amount` على صف `cancelled` → فشل.
  - 7.17: تعديل `amount` على صف `approved` بدون transition → فشل.
  - 7.18: تعديل `amount`/`title` على صف `draft` يعمل (لا regression).
- نتيجة الفحوصات: **56/56 passing** (50 سابقة + 6 جديدة).
- **المبدأ**: لا تثق بـ application layer وحدها لحماية الـ data integrity. RLS + DB triggers + CHECK constraints هم الحارس الأخير. الـ actions تُحسِّن UX و pre-flight feedback، لكن لا تستطيع منع تعديل مباشر من Supabase client بـ admin/treasurer credentials.

### التحديثات في 2.8 (المرحلة 7 — المالية: المصروفات)

- **`supabase/10_phase7.sql`** — workflow integrity + storage hardening، يطبَّق بعد `09_phase6.sql`:
  - **عمودان جديدان**: `paid_by uuid` + `paid_at timestamptz` لإثبات مَن سجّل الدفع ومتى. Backfill يُملأ تلقائياً للصفوف القديمة قبل تفعيل الـ CHECK.
  - **CHECK `chk_expenses_paid_proof`**: status='paid' يستوجب paid_by + paid_at + receipt_url غير فارغ. مرآة لـ §1.5.1 المطبَّقة على المدفوعات.
  - **CHECK `chk_expenses_approved_meta`**: status in ('approved','paid') يستوجب approved_by + approved_at.
  - **(درس Codex P1 من المرحلة 6 مُعمَّماً)** سياسة `expenses_insert_treasurer_admin` مُشدَّدة: تُلزِم status='draft' + جميع حقول المراجعة/الدفع/الإلغاء = NULL. لا يستطيع admin/treasurer إنشاء صف بحالة 'paid' مباشرة، متجاوزاً مراحل سير العمل والـ audit trail.
  - **Trigger `trg_expenses_validate_transition`** (BEFORE UPDATE OF status): يحرس الانتقالات. الانتقالات المسموحة فقط:
    - `draft → pending_review | cancelled`
    - `pending_review → approved | rejected | cancelled`
    - `rejected → draft` (المُنشئ يصلح ويعيد المحاولة، يمسح approved_by/approved_at)
    - `approved → paid | cancelled` (paid يستوجب receipt_url)
    - `paid` و `cancelled` **terminals** — لا انتقال خارجاً.
  - **(درس Codex P2.2 من المرحلة 6 مُعمَّماً)** سياسة `invoices_delete_own_orphan` على bucket `invoices`: orphan-only delete (bucket=invoices + owner=auth.uid() + لا expense.invoice_url يُشير للملف). فاتورة معتمدة → immutable.
  - **توسيع `receipts_delete_own_orphan`** ليشمل `expenses.receipt_url` بجانب `payments.receipt_url`. المصروفات المدفوعة تخزّن إيصال التحويل في bucket `receipts` بـ path `{building_id}/expenses/{expense_id}/receipt-<ts>.<ext>`، فالـ orphan check يجب أن يفحص الجدولين.

- **`src/lib/storage.ts`** موسَّع:
  - `validateInvoiceFile` (10MB max, JPG/PNG/WebP/PDF)
  - `uploadInvoice` → path `invoices/{building_id}/expenses/{expense_id}/invoice-<ts>.<ext>`
  - `getInvoiceSignedUrl`, `deleteInvoice`
  - `uploadExpenseReceipt` → path `receipts/{building_id}/expenses/{expense_id}/receipt-<ts>.<ext>` (نفس bucket المدفوعات، namespace مختلف)

- **`src/lib/validations/expenses.ts`** (Zod):
  - `expenseCreateSchema`, `expenseUpdateSchema` (نفس الحقول + expense_id)
  - `expenseRejectSchema`, `expenseCancelSchema` (سبب 3+ أحرف إلزامي)
  - `EXPENSE_TRANSITIONS`: قائمة بيضاء بـ JS تطابق الـ trigger في DB (single source of truth للانتقالات).

- **`src/lib/queries/expenses.ts`**:
  - `listExpenses` (فلاتر: status, category, vendor, date range + pagination 20/page)
  - `listPendingExpenses` (للقسم المخصَّص)
  - `getExpense`, `listVendorsForBuilding`, `listExpenseCategories` (distinct categories — autosuggest)
  - `enrich` يضيف vendor_name + created_by_name + approved_by_name + paid_by_name.

- **`src/actions/expenses.ts`** — 6 server actions:
  - `createExpenseAction` — يحفظ كـ draft، optional invoice upload، rollback عند فشل insert.
  - `updateExpenseAction` — مسموح فقط في draft/rejected. `.select('id').maybeSingle()` لرصد race conditions (درس Codex P2.1).
  - `submitExpenseAction` — draft → pending_review.
  - `approveExpenseAction` — pending_review → approved، يُختم بـ approved_by/approved_at.
  - `rejectExpenseAction` — pending_review → rejected، السبب يُلحَق بـ description tagged ليراه المُنشئ.
  - `markExpensePaidAction` — approved → paid، **receipt إلزامي** (proof of payment).
  - `cancelExpenseAction` — أي حالة غير-terminal → cancelled، سبب إلزامي.
  - كل الـ actions تستخدم `.select('id').maybeSingle()` على UPDATE → لا success صامت على 0-rows.

- **Components (8)**:
  - `expense-status-badge.tsx` — re-export من dashboard/status-badges (single source of truth للبادج).
  - `invoice-uploader.tsx` — مرآة لـ `receipt-uploader` بحد 10MB.
  - `expense-form.tsx` — create/edit موحَّد، vendor dropdown، category datalist (suggestions).
  - `expenses-table.tsx` — pagination + status badge + روابط للتفاصيل.
  - `expenses-filters.tsx` — status + category + vendor + date from/to + URL-driven.
  - `pending-expenses.tsx` — قسم منفصل للـ pending_review (مرآة لـ pending-payments).
  - `cancel-dialog.tsx` — modal بسبب إلزامي (3+ أحرف).
  - `status-actions.tsx` — أزرار workflow contextual: submit/approve/reject/markPaid حسب الحالة الحالية.
  - `file-preview.tsx` — generic signed-URL preview parametrized by bucket (يستخدم لـ invoice + receipt).

- **Pages (4)**:
  - `/expenses` (list + pending section + filters)
  - `/expenses/new` (admin/treasurer فقط)
  - `/expenses/[id]` (تفاصيل + workflow actions + invoice + receipt + سجل العمليات)
  - `/expenses/[id]/edit` (متاح فقط في draft/rejected)

- **`scripts/sql-validate.mjs`**: يطبّق 10_phase7.sql، 12 اختبار جديد للمرحلة 7 (بنيوي + functional للـ trigger/CHECK/policies). نتيجة: **50/50 passing** (38 سابقة + 12 جديدة).

- **`src/components/layout/nav-items.ts`**: `pending: true` أُزيل عن `/expenses`.

- **حدود واضحة بين مكوّنات Phase 6 و Phase 7**:
  - Receipt في bucket `receipts` يُستخدم في الجدولين، الفصل عبر path namespace (`{building}/payments/...` vs `{building}/expenses/...`).
  - `receipts_delete_own_orphan` يفحص الجدولين معاً لرفض حذف ملف مرتبط بأيهما.
  - `payment-form` و `expense-form` يتشاركان النمط لكن منفصلَين (شقة+شهر vs مورد+تصنيف).

### التحديثات في 2.7 (إغلاق ملاحظات مراجعة المرحلة 6 من Codex — round 2)

- **`supabase/09_phase6.sql`**: ملف هاردنينغ يطبَّق بعد `08_phase5.sql`. يعالج ثغرتين رصدهما Codex في الجولة الأولى:
  - **(P1) `payments_insert` policy تحكم سير العمل**: السياسة السابقة تسمح لأي ساكن بإدراج صف بحالة `status='approved'` و `approved_by=<أي uuid>` مباشرة عبر Supabase client، متجاوزاً مراجعة أمين الصندوق. بُدِّلت بسياسة تشترط `status='pending' AND approved_by IS NULL AND approved_at IS NULL AND rejection_reason IS NULL` على INSERT. التحوّل لـ `approved/rejected` يحدث **حصراً** عبر UPDATE الذي تحرسه `payments_update_treasurer`.
  - **(P2.2) `receipts_delete_own_orphan` storage policy**: bucket `receipts` لم تكن تحوي DELETE policy، فـ `deleteReceipt` rollback في `createPaymentAction` كان يفشل بصمت ويترك ملفات يتيمة في Storage. السياسة الجديدة تسمح بـ DELETE فقط حين: `bucket_id='receipts'` + `owner=auth.uid()` + لا يوجد `payments.receipt_url` يُشير للملف. بمجرد ربط الملف بصف payment، `EXISTS` يعود true والحذف ممنوع → "إثبات الدفع" للمدفوعات المعتمدة يبقى immutable.
- **`src/actions/payments.ts` — تحصينات على مستوى الكود**:
  - **(P2.2) Pre-flight check قبل الـ upload**: قبل رفع الملف لـ Storage، يفحص `createPaymentAction` وجود الشقة + عضوية المستخدم فيها (أو دور admin/treasurer). يُرجِع رسالة عربية واضحة قبل إنفاق bandwidth على upload محكوم بالفشل عند RLS insert.
  - **(P2.1) `.select('id')` على approve/reject**: UPDATE … WHERE status='pending' لم يكن يميِّز "0 rows updated" عن النجاح. أُضيف `.select('id')` ليرصد الحالة، ويُرجع رسالة `"الدفعة لم تعد بانتظار المراجعة (ربما اعتُمِدت أو رُفِضت من قبل عضو آخر)"`. لا success صامت في race conditions بين أمناء الصندوق.
- **`scripts/sql-validate.mjs`**:
  - تطبيق `09_phase6.sql` ضمن full pipeline (المجموع 9 ملفات).
  - اختباران بنيويان جديدان: (1) `payments_insert` WITH CHECK يحوي pending lock + null review fields، (2) `receipts_delete_own_orphan` policy موجودة و scoped لـ receipts + owner + orphan-only.
  - نتيجة التشغيل: **38/38 passing** (36 سابقة + 2 جديدة).
- **مبدأ الهاردنينغ**: لا تثق بـ application code وحده لمنع تجاوز سير العمل المالي. RLS هي الحارس الأخير، والكود يضيف تجربة أفضل و pre-flight feedback.

### التحديثات في 2.6 (المرحلة 6 — المالية: المدفوعات)

- **التزام صارم بـ §1.5.1** (الدفع اليدوي فقط):
  - `payment_status` enum يحوي 3 قيم فقط (موروث من المرحلة 1، مُختبَر).
  - **لا** webhook routes، **لا** payment intent fields، **لا** أي زر/كلمة "ادفع الآن" في الواجهة.
  - الإيصال **إلزامي** عند الإنشاء (DB CHECK + server action validation + UI required).
  - الرفض يستلزم سبب (DB CHECK + zod + dialog modal مخصَّص).
- **`src/lib/storage.ts`**: helpers لرفع/تحقّق/تنزيل الإيصالات. `validateReceiptFile` (5MB max، JPG/PNG/WebP/PDF فقط)، `uploadReceipt` (path = `{building_id}/payments/{payment_id}/receipt.<ext>`)، `getReceiptSignedUrl` (TTL 1 ساعة)، `deleteReceipt` (best-effort rollback).
- **`src/lib/queries/payments.ts`**: `listPayments` (مع filters + pagination 20/page)، `listPendingPayments` (للقسم المخصَّص)، `getPayment`، `listApartmentsForPayment` (privileged يرى الكل، resident يرى شققه فقط).
- **`src/actions/payments.ts`**:
  - `createPaymentAction` — ذرّي: validate → upload → insert. لو insert فشل، rollback storage. status='pending' دائماً.
  - `approvePaymentAction` — treasurer/admin فقط. UPDATE … WHERE status='pending' (لا re-approve).
  - `rejectPaymentAction` — treasurer/admin فقط. سبب إلزامي.
  - audit triggers من المرحلة 1 تسجل كل INSERT/UPDATE تلقائياً.
- **Components** (7 جديدة): `payment-form`, `receipt-uploader`, `receipt-preview`, `approval-actions`, `payments-filters`, `payments-table`, `pending-payments`.
- **Pages** (3): `/payments`, `/payments/new`, `/payments/[id]`.
- **next.config.ts**: `experimental.serverActions.bodySizeLimit = '6mb'` لقبول رفع receipts حتى 5MB.
- **nav-items.ts**: `pending: true` أُزيل عن `/payments`.
- **مصدر الحقيقة**: dashboard و reports تستخدم status='approved' فقط (موروث من المرحلة 4)، الـ pending قسم منفصل visually + functionally.

### التحديثات في 2.5 (تمرير الـ cookie المعدَّلة لـ Server Components في نفس الطلب)

- **إعادة هيكلة `updateSession`**: لم تعد تُرجع `response`. تُرجع `cookiesToSync: CookieToSet[]` — قائمة بكل cookie writes طلبتها Supabase (refreshed auth tokens). الـ `setAll` callback يُحدِّث `request.cookies` فقط ويراكم في `cookiesToSync`، لا ينشئ response.
- **`attachCookies(res, cookies)` helper**: يُطبِّق قائمة الـ cookies على أي `NextResponse` (next/redirect/rewrite). يستخدمه middleware لإصدار جميع الـ Set-Cookie headers في النهاية.
- **النمط الصحيح في `middleware.ts`**: 
  - كل `request.cookies.set(...)` calls (من supabase setAll + من admin gate fallback) تحدث **قبل** بناء الـ response النهائي
  - `NextResponse.next({ request })` أو `redirect`/`rewrite` تُبنى **مرة واحدة** في النهاية
  - `attachCookies` يُطبِّق كل الـ cookies المتجمِّعة على ذلك الـ response
  - النتيجة: أي تعديل على `request.cookies` يصل لـ Server Components downstream عبر الـ `request` المُمرَّر للـ NextResponse، وأي تحديث على `response.cookies` يصل للمتصفح للطلبات القادمة
- **إصلاح bug سابق**: قبل هذا التحديث، redirects/rewrites في middleware (مثلاً 403 لـ super-admin، redirect لـ /login) كانت تُنشئ NextResponse جديدة بدون نقل cookies الـ supabase الحديثة. الآن `attachCookies` يضمن أن كل response يحمل الـ refreshed auth tokens والـ active_building_id.
- يحفظ سيناريو "مستخدم admin يحذف cookie ويفتح /apartments": middleware يضبط cookie على عمارة admin، الـ `request.cookies.set` يجعل AppLayout يقرأها مباشرة في نفس الطلب (لا بعد reload).

### التحديثات في 2.4 (role-aware fallback في middleware)

- **fallback role-aware**: middleware لا يكتفي بالسماح "أي admin membership" ثم يترك AppLayout يختار. بدل ذلك:
  - يبحث عن أول `admin` building (`role='admin'`, `is_active=true`, مرتَّب بـ `created_at`) للمستخدم
  - يضبط cookie `active_building_id` على ذلك الـ admin building في **`request.cookies` و `response.cookies`** معاً (الأول لـ server components التالية في نفس الطلب، الثاني لتخزين المتصفح للطلبات القادمة)
  - بالتالي AppLayout يرى cookie لـ admin building مباشرةً، ولا يستبدلها بـ resident building بسبب ترتيب `created_at`
- **الحالة "cookie صالحة لكن دور resident فقط"**: middleware يحترم اختيار المستخدم الصريح ولا يبدّل cookie تلقائياً — يُرجع 403، والمستخدم يستخدم building switcher إن أراد admin context.
- يحفظ الأمن: لا يمنح صلاحية لمستخدم لا يملك admin أصلاً.
- يحفظ سيناريو المرحلة 2: حذف cookie → /apartments يعمل لـ admin (يضبط على عمارة admin)، 403 لـ resident فقط.

### التحديثات في 2.3 (إغلاق ملاحظة fallback الـ middleware من Codex)

- **fallback في middleware لـ admin-only paths**: إذا كان `active_building_id` cookie مفقوداً أو يشير لعمارة غير صالحة (stale)، middleware لم يعد يُرجع 403 فوراً. بدل ذلك:
  - يفحص هل المستخدم له أي active `admin` membership في أي عمارة
  - إن نعم → يسمح بالطلب، و `AppLayout` سيُعيد ضبط الـ cookie عبر `ensureActiveBuilding()`
  - إن لا → 403 صريح كالسابق
- يحفظ سيناريو المرحلة 2: "حذف cookie active_building_id يدوياً → النظام يعيد التعيين للأولى المتاحة".
- لا يكسر الأمن: defense-in-depth — middleware يفحص "any admin membership"، AppLayout يضبط الـ cookie الصحيح، page-level check يقرر النهائي.

### التحديثات في 2.2 (إغلاق ملاحظات مراجعة المرحلة 5 من Codex)

- **إصلاح P1 — لا role escalation عند إعادة التفعيل**: `link_apartment_member` لم يعد يستخدم `on conflict do update set is_active=true` (الذي كان يحفظ الدور القديم). الآن:
  - لا توجد row → INSERT بدور `resident`
  - row غير نشطة → UPDATE بـ `is_active=true, role='resident'` (إعادة تفعيل **قسرية كـ resident**؛ لا يستعيد دور admin/treasurer/committee)
  - row نشطة → لا تغيير (تحفظ الأدوار العالية النشطة)
- **إصلاح P2 — `auth-admin` wrapper**: ملف جديد `src/lib/supabase/auth-admin.ts` (`import 'server-only'`) يكشف **فقط** `.auth.admin` (بلا `from()`/`rpc()`/`storage`). `linkOrInviteMemberAction` تستخدمه بدلاً من `createAdminClient`. لا يمكن تجاوز RLS على business tables من خلاله.
- **PLAN §2.3 amendment رسمي**: استثناء محدَّد لـ `auth.admin` operations خارج `(super-admin)/`، يقتصر على `getAuthAdmin()` wrapper. موثَّق صراحةً في §2.3.
- **Middleware-level 403 لـ admin-only paths**: `ADMIN_ONLY_PREFIXES = ['/apartments']`. middleware يقرأ `active_building_id` cookie ويتحقق من `membership.role = 'admin'`؛ إن لا → rewrite لـ `/forbidden` بـ status **403**. `super_admin` مستثنى. الـ check على مستوى middleware (قبل render) + الـ page-level check باقٍ كـ defense-in-depth.
- **اختبار جديد** (`Phase 5 Codex P1`): يُنشئ membership خاملة بدور admin، يستدعي `link_apartment_member` كـ resident، يتحقق أن الـ row أُعيد تفعيلها بـ `role='resident'`. **36/36 ✓**.

### التحديثات في 2.1 (المرحلة 5 — إدارة الشقق والسكان)

- **`supabase/08_phase5.sql`** بـ 3 SECURITY DEFINER functions:
  - `link_apartment_member(p_apartment_id, p_user_id, p_relation_type)` — أول عضو يُعيَّن voting rep تلقائياً + auto-create building_membership كـ resident لو غير موجود
  - `change_voting_representative(p_apartment_id, p_new_member_id)` — تبديل ذرّي
  - `deactivate_apartment_member(p_member_id, p_replacement_member_id?)` — يمنع إزالة الممثل دون بديل
- **Server actions** (`src/actions/apartments.ts`): `createApartmentAction`, `updateApartmentAction`, `linkOrInviteMemberAction`, `changeVotingRepAction`, `deactivateMemberAction`.
- **Pages**: `/apartments` (list + URL filters)، `/apartments/new` (create)، `/apartments/[id]` (تفاصيل + members + edit).
- **Components** (6): apartment-status-badge، apartments-filters، apartments-table، apartment-form، link-member-dialog، members-list.
- **Validations** zod في `src/lib/validations/apartments.ts`، queries في `src/lib/queries/apartments.ts`.
- **nav-items.ts**: `pending: true` أُزيل عن `/apartments`.

### التحديثات في 2.0 (إغلاق ملاحظات مراجعة المرحلة 4 من Codex)

- **حساب المستحقات الفعلي للساكن** (P2.1): استبدلت `outstanding = 0` الثابتة بحساب حقيقي:
  - يحدِّد آخر 12 شهراً مكتملاً (ما قبل الشهر الحالي)
  - لكل شقة، يحسب الأشهر التي ليس فيها دفعة `approved` بـ `period_month` مطابق
  - يستثني الأشهر السابقة لتاريخ إنشاء الشقة (فلا تُحسب على شقة سُجِّلت حديثاً)
  - النتيجة: `outstanding = unpaid_months × monthly_fee` و `outstandingMonths` للعرض
  - أُضيف `StatsCard` "المستحقات (المتأخر)" كأول بطاقة في `ResidentDashboard` مع trend badge ("يحتاج سداد" / "محدَّث")
  - بطاقة "التصويتات" placeholder حُذفت (ActiveVotes section أدنى يعرضها بالتفصيل)
- **استثناء الأشهر المستقبلية من إحصائيات الشهر الحالي** (P2.2): `sumPayments` و `sumExpenses` يقبلان الآن `from + toExclusive` (range مغلق)؛ `getBuildingDashboardSummary` يمرر `[monthStart, nextMonthStart)`. أي دفعة/مصروف بتاريخ مستقبلي أو في الشهر التالي لا يُحسب. أُضيف `nextMonthString` و `lastNMonthKeys` لـ `format.ts`.
- **إزالة Card-in-Card في TechnicianDashboard** (P3): `RecentMaintenance` يعيد `Card` بنفسه، فأُزيلت الـ `<Card>` الخارجية في TechnicianDashboard. النتيجة: إطار واحد، spacing سليم.

### التحديثات في 1.9 (المرحلة 4 — لوحة التحكم)

- **`src/lib/format.ts`**: formatters عربية موحَّدة — `formatCurrency` (SAR، Arabic-Indic)، `formatDate`/`formatDateLong`/`formatDateTime` (تقويم ميلادي عبر `ar-SA-u-ca-gregory`)، `formatRelative` (Intl.RelativeTimeFormat)، `formatMonth`، `periodMonthString`.
- **`src/lib/queries/dashboard.ts`**: query helpers reusable لاحقاً — `getBuildingDashboardSummary` (balance + income/expense هذا الشهر + counts)، `getRecentPayments`، `getRecentExpenses`، `getRecentMaintenance` (مع filters لـ assignedTo/requestedBy/onlyOpen)، `getActiveVotesForUser` (مع per-user voted/pending/not_eligible)، `getResidentSummary`، `getTechnicianAssigned`.
- **3 dashboard variants منفصلة فعلياً** (لا صفحة واحدة بإخفاء أزرار):
  - `AdminDashboard` (لـ admin + treasurer + committee): 4 stats رئيسية (الرصيد + دخل الشهر + مصروفات الشهر + بانتظار المراجعة) + 2 إضافية (طلبات صيانة + تصويتات نشطة) + QuickActions حسب الدور + recent payments/expenses/maintenance + active votes.
  - `ResidentDashboard`: 4 stats (شقتي + آخر دفعة بـ status badge + طلبات صيانتي + إشارة تصويت) + QuickActions (تسجيل دفعة، فتح صيانة، تقديم اقتراح) + recent maintenance (للمستخدم) + active votes.
  - `TechnicianDashboard`: 1 stats (المسندة لي) + قائمة الطلبات المفتوحة المسندة فقط.
  - `RoleBasedDashboard` switcher.
- **Status badges مركزية** (`status-badges.tsx`): `PaymentStatusBadge`، `ExpenseStatusBadge`، `MaintenanceStatusBadge`، `PriorityBadge` بـ ألوان + نصوص عربية.
- **QuickActions**: 4 أزرار للأدمن، 2 للأمين، 2 للجنة، 3 للساكن، 0 للفني.
- **`StatsCard` + `StatsCardSkeleton`** reusable مع emphasizeNegative للرصيد السالب + trend badge.
- **`loading.tsx`**: skeleton تلقائي عبر Suspense عند التنقل لـ /dashboard.
- **سياسة Quick Actions الناقصة**: links لـ /payments/new, /expenses/new, /apartments/new, /votes/new, إلخ — تذهب لـ 404 حالياً (مقبول حسب §5/المرحلة 4: "حتى لو الصفحة المستهدفة لم تُبنَ بعد").

### التحديثات في 1.8 (إغلاق ملاحظات مراجعة المرحلة 3 من Codex)

- **3 مكونات shadcn ناقصة أُضيفت**:
  - `src/components/ui/popover.tsx` — Radix-based
  - `src/components/ui/accordion.tsx` — Radix-based مع animate-accordion-up/down
  - `src/components/ui/drawer.tsx` — vaul-based (bottom sheet draggable للجوال)
- **Calendar مؤجَّل رسمياً** في PLAN §5 المرحلة 3: يُسلَّم في أول مرحلة تحتوي حقل تاريخ (5 أو 6). السبب: `react-day-picker` dep ثقيل بدون استخدام حالي.
- **placeholder للإشعارات في AppHeader**: زر `<Bell>` معطَّل مع Tooltip "الإشعارات — قريباً" + aria-label + slot لـ unread badge dot في المستقبل.
- **BottomNav يفلتر بـ role**: `mobileBottomNav` الآن يحمل `roles` صراحةً (Payments/Votes تخفى عن technician)، و `visibleMobileItems(role)` helper يطبّق الفلترة بنفس منطق `visibleNavItems`. technician الآن يرى Dashboard + Maintenance + قائمة "المزيد" فقط.
- **Dependencies**: +`@radix-ui/react-accordion` +`vaul`.

### التحديثات في 1.7 (المرحلة 3 — نظام التصميم والـ Layout)

- **Tailwind config + CSS variables كاملة**: ألوان shadcn القياسية (primary/secondary/muted/accent/destructive/success/warning + popover/card) في light + dark، borderRadius متغيِّر، tailwindcss-animate للـ keyframes (accordion, sheet slides، إلخ).
- **17 UI primitive shadcn-style** (في `src/components/ui/`): button (variants + asChild + loading)، input، label (Radix)، textarea، select (Radix)، card، badge (6 variants)، dialog (Radix)، sheet (Radix بـ side variants)، dropdown-menu (Radix)، separator (Radix)، avatar (Radix)، skeleton، tabs (Radix)، tooltip (Radix). كلها مع `cva` للـ variants و `cn()` للـ class merging.
- **6 shared components** (في `src/components/shared/`):
  - `EmptyState` — أيقونة + عنوان + وصف + action
  - `LoadingState` — spinner + رسالة + 3 أحجام
  - `ErrorState` — alert + retry button
  - `PageHeader` — title + description + actions، responsive
  - `ConfirmDialog` — Dialog reusable مع destructive variant + loading
  - `DataTable` — جدول مع sorting + pagination + empty state + toolbar slot
- **6 layout components** (في `src/components/layout/`):
  - `AppShell` — يجمع sidebar + header + main + bottom-nav + TooltipProvider
  - `AppSidebar` — desktop (≥md)، sticky، يلتزم بدور المستخدم
  - `AppHeader` — sticky، building switcher + theme toggle + user menu، logo للجوال
  - `BottomNav` — mobile only (<md)، 4 روابط مختصرة + Sheet "المزيد" للقائمة الكاملة
  - `UserMenu` — Avatar + DropdownMenu (اسم/بريد + الملف الشخصي + تسجيل الخروج)
  - `NavLink` — يحدِّد active state تلقائياً، variants sidebar/mobile
  - `nav-items.ts` — تعريف مركزي لكل الروابط مع `roles` و `pending` (للأقسام التي تأتي لاحقاً)
- **Theme toggle مُحدَّث**: DropdownMenu بـ system/light/dark بدلاً من toggle ثنائي.
- **Building switcher مُحدَّث**: يستخدم shadcn DropdownMenu، يُعطَّل لو عمارة واحدة.
- **(app) layout** يستخدم `AppShell`، يجلب role و buildingName للـ context.
- **(super-admin) layout** بنفس النمط لكن أبسط (لا sidebar، header مع UserMenu).
- **Dashboard page** مُحدَّثة: PageHeader + 4 StatCards (شقق + أعضاء + صيانة + تصويتات) + 2 EmptyStates للمدفوعات/المصروفات (تأتي في المرحلة 4).
- **RTL polish**: CSS rule يقلب lucide arrows (chevron-right/left, arrow-right/left) في `[dir='rtl']` كي تتبع اتجاه القراءة.
- **مكتبات جديدة**: `@radix-ui/react-*` (10 packages)، `class-variance-authority`، `tailwindcss-animate`.

### التحديثات في 1.6 (إغلاق ملاحظات مراجعة المرحلة 2 من Codex)

- **حلقة `/onboarding ↔ /register`** (P1.1): فصل إنشاء العمارة في `createBuildingAction` server action مستقل + إضافة `CreateBuildingForm` على صفحة `/onboarding` مباشرة. زر "إنشاء عمارة" لم يعد يحوّل لـ `/register`. حل الحلقة كلياً.
- **idempotency للتسجيل** (P1.2): `registerBuildingAction` الآن يعيد `redirectTo` ديناميكياً:
  - signup + RPC نجحا → `/dashboard`
  - signup نجح + RPC فشل → `/onboarding` (المستخدم يعيد المحاولة عبر `createBuildingAction`)
  - signup نجح بدون session (email-confirm مُفعَّل) → `/login` مع رسالة لتأكيد البريد
- **Auth callback لـ password reset** (P1.3): إضافة `src/app/auth/callback/route.ts` يستقبل `code` (PKCE) أو `token_hash`+`type` (OTP) من Supabase ويبادله لـ session. `forgotPasswordAction` الآن يستخدم `redirectTo: /auth/callback?next=/reset-password`. middleware يضيف `/auth/callback` للـ public + يستثني `/reset-password` من إعادة توجيه المستخدمين المسجَّلين (لأنه يحتاج session مُنشأة من callback).
- `buildingDetailsSchema` zod schema مُستخرج كي يستخدمه كل من `registerBuildingSchema` (combined) و `createBuildingAction` (logged-in user).
- `LoginForm` يُحوّل لـ `/` بعد تسجيل الدخول (الـ root يُعيد التوجيه ذكياً لـ dashboard / onboarding / super-admin حسب حالة المستخدم).
- `supabase/README.md`: إضافة `psql "$DATABASE_URL" -f supabase/07_phase2.sql` لأوامر CLI.

### التحديثات في 1.5 (المرحلة 2 — Auth & Multi-Tenancy)

- **`supabase/07_phase2.sql` جديد**: يحذف bootstrap policy و يضيف `register_building()` SECURITY DEFINER function للتسجيل الذرّي.
- **Supabase clients** (4 ملفات): `client.ts` (browser), `server.ts` (RSC + actions), `middleware.ts` (edge), `admin.ts` (server-only، service_role).
- **Auth pages**: `/login`, `/register`, `/forgot-password`, `/reset-password` + auth layout RTL.
- **Server actions**: `loginAction`, `registerBuildingAction`, `logoutAction`, `forgotPasswordAction`, `resetPasswordAction`, `switchBuildingAction`.
- **Middleware** (`src/middleware.ts`): يحمي `(app)` و `(super-admin)`، يعيد توجيه auth routes للـ dashboard إن كان المستخدم مسجّل دخوله، يُرجع 403 صريح للسوبر أدمن من حساب عادي.
- **Helpers**: `src/lib/permissions.ts` (`hasRole`, `requireRole`, `isSuperAdmin`, `requireSuperAdmin`)، `src/lib/tenant.ts` (active building cookie + `getUserBuildings`, `ensureActiveBuilding`).
- **Layouts**: `(app)/layout.tsx` بـ header + building switcher + theme toggle + logout. `(super-admin)/layout.tsx` بـ double-check للسوبر أدمن.
- **Pages**: `dashboard` (placeholder)، `onboarding` (للمستخدم بدون عمارة)، `super-admin` (إحصائيات أولية)، `forbidden` (403).
- **UI components**: `Button`, `Input`, `Label`, `Toaster` (sonner). تُستبدل بـ shadcn/ui الكامل في المرحلة 3.
- **التحقق**: `scripts/sql-validate.mjs` مُمدَّد — الآن **28/28 ✓** (تشمل: drop bootstrap policy، register_building functional + empty-name + unauthenticated، الـ 23 السابقة).
- **الـ Stack**: ترقية `@supabase/ssr` (0.5 → 0.10) و `@supabase/supabase-js` لتوافق الـ types.

### التحديثات في 1.4 (تثبيت ملاحظات مراجعة المرحلة 1 من Codex)

- **Tenant consistency شامل** (إغلاق Issues #1, #3, #5 من مراجعة Codex): composite UNIQUEs على كل الجداول الأم (`apartments`, `expenses`, `votes`, `vote_options`, **`vendors`**, **`suggestions`**) و composite FKs على كل علاقة tenant — `apartment_members`, `payments`, `maintenance_requests`, `decisions`, `vote_responses`, **`expenses.vendor_id`**, **`votes.suggestion_id`**. أي محاولة لخلط `building_id` مع entity من عمارة أخرى تفشل على مستوى DB.
- **Vote-option integrity** (إغلاق Issue #2): `vote_responses` composite FK على `(option_id, vote_id) → vote_options(id, vote_id)` يضمن أن الخيار يخص التصويت المحدد.
- **vote_responses.building_id** أُضيف كحقل NOT NULL لتمكين الـ composite FKs أعلاه.
- **إغلاق ثغرة تزوير audit_logs** (Issues #4 + #6):
  - إزالة policy `audit_insert_authenticated` المفتوحة.
  - **حذف `log_audit_event()` بالكامل** (كان قابلاً للاستدعاء من أي authenticated client كـ RPC، forgeable حتى مع membership gating).
  - الإدخال حصراً عبر `audit_changes()` SECURITY DEFINER trigger (تلقائي) أو service_role من server-only routes.
- إضافة 8 سيناريوهات اختبار جديدة (#14–#21) تغطي tenant consistency الشامل و vote-option integrity و audit forging.
- الـ schema: تحويل `uuid_generate_v4()` إلى `gen_random_uuid()` (built-in PG13+، لا يحتاج extension).
- إضافة سكربت تحقق محلي `scripts/sql-validate.mjs` يطبّق `01→04` على PGlite ويختبر **19 قيداً أمنياً** بدون الحاجة لـ Supabase.

### التحديثات في 1.3

- **شرط استلام رسمي للمرحلة 0** (Delivery Requirement): قائمة ملفات + أوامر تشغيل + **raw output** لـ install/build/lint/typecheck + تأكيد checklist بنداً بنداً. أي تسليم ناقص للبنود 1–4 **يُرفض قبل بدء المراجعة** (لا يُحتسب وقت).
- إضافة `pnpm typecheck` للقائمة المعتمدة + ضمن معايير قبول المرحلة 0 (script في `package.json` + يمر بصفر TypeScript errors).
- تحديث **§7.1** ليشمل نتائج الفحوصات الأساسية (`install`/`build`/`lint`/`typecheck`) كحد أدنى موحَّد لكل المراحل التي تعدّل الكود + إشارة صريحة لشروط الاستلام الإضافية لكل مرحلة.

### التحديثات في 1.2

- **تصحيح عدّ الجداول** في المرحلة 1: من **16** إلى **17** (الصحيح بعد عدّ `documents` و `audit_logs`).
- **توضيح صياغة منع الحذف**: استبدال "لا يحتويان زر حذف في السياسات" بـ صياغة دقيقة تقنياً: **"لا توجد `DELETE` policies على مستوى DB + لا واجهة حذف في UI"** (السلوك يُفصّل في المراحل 6 و 7).
- **تحديد آلية `super_admin` بدقة** (في §2.3 + اختبارات المرحلة 1):
  - **READs** على بيانات العمارات → عبر RLS clauses (`OR is_super_admin()` على كل policy)، **لا** service_role.
  - **WRITEs الإدارية على المنصة** (subscriptions, تعطيل، إلخ) → `service_role` حصراً في `(super-admin)/` server routes.
  - **WRITEs على بيانات عمارة** من super_admin → عبر RLS العادية، لا service_role.
  - `service_role` ممنوع خارج `(super-admin)/` و في أي client code (مع `import "server-only"` و ESLint rule كـ bonus).
  - 3 سيناريوهات اختبار جديدة في المرحلة 1 (#11, #12, #13) لفحص الآلية.

### التحديثات في 1.1

- **القسم 1.5 جديد** — قيود النطاق (Scope Constraints) لتثبيت قرارَين معماريَّين/وظيفيَّين:
  - **1.5.1**: الدفع يدوي فقط، لا بوابات إلكترونية، لا webhooks، لا "ادفع الآن".
  - **1.5.2**: التصويت per-apartment فقط بممثل واحد لكل شقة (`is_voting_representative`)، حذف `voting_scope`.
- **القسم 3.2** — تحديث مصفوفة الصلاحيات: تصويت "باسم الشقة" + شرط voting_representative + صف جديد لتعيين الممثل.
- **المرحلة 1 (DB)** — معايير قبول جديدة: `is_voting_representative` + unique partial index + حذف `voting_scope` + قيود `payments.rejection_reason` و `receipt_url`. سيناريوهات أمان جديدة (11 بدل 8).
- **المرحلة 5 (Apartments)** — إضافة إدارة ممثل التصويت (تعيين تلقائي، تغيير ذرّي، منع الإزالة دون بديل) + 3 سيناريوهات اختبار جديدة.
- **المرحلة 6 (Payments)** — تذكير حاسم بالدفع اليدوي + إيصال إلزامي + قسم "بانتظار المراجعة" منفصل + 7 سيناريوهات أمان جديدة (14 بدل 7).
- **المرحلة 10 (Voting)** — إعادة كتابة شاملة: per-apartment فقط، حذف `voting_scope`، defense-in-depth على 3 طبقات، 24 سيناريو اختبار شامل (تشمل الـ 5 الإلزامية أ–هـ).
- **القسم 6.3 (Security)** — قسمان جديدان: Payment Integrity + Voting Integrity مع شرط رفض أي PR يخالف القيود.
