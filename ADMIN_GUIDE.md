# دليل المسؤول (ADMIN_GUIDE)

> دليل عملي لـ **super_admin** (مالك المنصة) و **admin** (مدير عمارة).

كل قسم يَبدأ بمن يُنفِّذه، ثم خطوات الإجراء بالـ UI، ثم استثناءات شائعة.

---

## جدول المحتويات

1. [مَن هو super_admin ومَن هو admin؟](#1-الأدوار)
2. [super_admin — إعداد المنصة](#2-super_admin--إعداد-المنصة)
3. [super_admin — إدارة العمارات والاشتراكات](#3-super_admin--إدارة-العمارات-والاشتراكات)
4. [super_admin — مراقبة المنصة](#4-super_admin--مراقبة-المنصة)
5. [admin — إنشاء عمارة جديدة](#5-admin--إنشاء-عمارة-جديدة)
6. [admin — إدارة الشقق والسكان](#6-admin--إدارة-الشقق-والسكان)
7. [admin — المدفوعات الشهرية](#7-admin--المدفوعات-الشهرية)
8. [admin — المصروفات والمزودون](#8-admin--المصروفات-والمزودون)
9. [admin — الصيانة والمهام](#9-admin--الصيانة-والمهام)
10. [admin — التصويتات والقرارات](#10-admin--التصويتات-والقرارات)
11. [admin — التقارير المالية](#11-admin--التقارير-المالية)
12. [admin — سجل النشاطات (Audit)](#12-admin--سجل-النشاطات-audit)
13. [مفاهيم متقدِّمة](#13-مفاهيم-متقدِّمة)

---

## 1. الأدوار

| الدور | المسؤولية | كيف يُنشَأ؟ |
|---|---|---|
| **super_admin** | مالك المنصة، يَرى كل العمارات، يُدير الاشتراكات | يدوياً عبر SQL — لا UI |
| **admin** | مدير عمارة واحدة (أو أكثر بأدوار مختلفة) | تلقائياً عند `register_building()` أو يُضيفه admin قائم |
| **treasurer** | المالية فقط | يُضيفه admin |
| **committee** | عضو لجنة (اقتراحات + تصويتات + تقارير) | يُضيفه admin |
| **resident** | ساكن — يَرى شقته فقط | admin يُدخِل بريده في "ربط عضو" — لو مُسجَّل يُربط مباشرة، لو غير مُسجَّل تُرسل دعوة بريدية تلقائياً (`auth.admin.inviteUserByEmail`) |
| **technician** | فني — يَرى المهام المُسندة له | يُضيفه admin |

**مهم**: 
- `super_admin` لا يَظهر في `building_switcher`، ولا يَكون عضواً في أي عمارة. هو فوق الـ tenants.
- شخص واحد قد يَكون admin في عمارة A و resident في B في نفس الوقت (multi-membership).

---

## 2. super_admin — إعداد المنصة

### إنشاء أول super_admin

بعد deploy جديد، السوبر أدمن غير موجود. أنشئه يدوياً:

1. **سجِّل حساباً عادياً** عبر `/register` (مثلاً `owner@your-platform.com`).
2. **افتح Supabase Dashboard → SQL Editor** → نفِّذ:
   ```sql
   update public.profiles
   set is_super_admin = true
   where id = (
     select id from auth.users where email = 'owner@your-platform.com'
   );
   ```
3. **سجّل خروج وأَعِد الدخول** — ستُحوَّل تلقائياً إلى `/super-admin`.

### إنشاء super_admin إضافي

نفس الخطوات أعلاه، لكن للحساب الثاني. لا توجد UI لمنح هذه الصلاحية بقصد — أمن.

### إلغاء super_admin

```sql
update public.profiles
set is_super_admin = false
where id = (select id from auth.users where email = 'old-admin@your-platform.com');
```

الشخص لن يَتمكَّن من فتح `/super-admin` بعد الـ logout/login التالي. حساباته الـ admin في عمارات (إن وُجدت) تَبقى.

---

## 3. super_admin — إدارة العمارات والاشتراكات

### عرض كل العمارات

`/super-admin/buildings` — جدول بكل العمارات على المنصة:
- اسم العمارة + الخطة + الحالة + تاريخ انتهاء التجربة + تاريخ انتهاء الاشتراك + تاريخ الإنشاء.
- علامة "قريب" حمراء على العمارات التي تَنتهي تجربتها خلال 7 أيام.
- فلاتر: الحالة (trial/active/past_due/cancelled/expired) + الخطة + بحث بالاسم.

### تفاصيل عمارة + إدارة اشتراكها

اضغط اسم العمارة من الجدول → `/super-admin/buildings/[id]`. ستَجد 3 أقسام:

#### 3.1 ملخّص العمارة
- الخطة الحالية + الحالة + انتهاء التجربة + انتهاء الاشتراك + العنوان + تاريخ الإنشاء.

#### 3.2 إحصائيات الاستخدام (`UsageStats`)
8 cards من RPC `building_usage_detail`:
- عدد الشقق + عدد الأعضاء النشطين
- مدفوعات بانتظار الاعتماد + إجمالي المدفوعات المعتمدة
- إجمالي المصروفات المدفوعة + صيانة مفتوحة
- تصويتات نشطة + آخر نشاط

تُساعدك تَتحقَّق من نشاط العمارة قبل قرارات الاشتراك (مثلاً: لا تَمدِّد تجربة عمارة لم تَستخدم النظام).

#### 3.3 إعدادات الاشتراك (`SubscriptionControls`)

ثلاث surfaces:

##### A) Quick actions (للعمليات السريعة)

- **تمديد التجربة** (يَظهر فقط إن كانت الحالة `trial`):
  - أدخل عدد الأيام (1-365) → اضغط "تمديد"
  - يُمدِّد `trial_ends_at` بنفس عدد الأيام (إن كان قد انتهى، يَنطلق من الآن).

- **تعطيل العمارة** (يَظهر إن لم تَكن `expired/cancelled`):
  - يُحوِّل الحالة إلى `expired`.
  - **كل أعضاء العمارة لن يَتمكَّنوا من الدخول** فوراً. middleware يَحجبهم → `/subscription-inactive`.
  - **مهم**: لو العضو له عمارة أخرى نشطة، الـ middleware يُبدِّل تلقائياً إلى تلك (path-aware fallback).
  - super_admin يَبقى يَرى كل البيانات للدعم.

- **إعادة تفعيل** (يَظهر إن كانت `expired/cancelled`):
  - يُعيد الحالة إلى `active`.

##### B) Full edit form

تَعديل كامل لـ:
- الخطة: trial / basic / pro / enterprise
- الحالة: trial / active / past_due / cancelled / expired
- انتهاء التجربة (datetime)
- انتهاء الاشتراك (datetime)

⚠️ **التحويلات المسموحة محدودة بـ whitelist في الـ DB** (transition trigger):
- `trial → active | expired | cancelled`
- `active → past_due | cancelled | expired`
- `past_due → active | cancelled | expired`
- `expired → active | trial`
- `cancelled → active | trial`

أي transition خارج هذه القائمة يُرجع رسالة "انتقال حالة الاشتراك غير صالح". هذا حماية ضد الأخطاء — مثلاً لا يُمكن العودة المباشرة من `expired` إلى `past_due`.

### audit logs لكل تعديل اشتراك

كل تعديل على buildings يُسجَّل تلقائياً في `audit_logs` عبر trigger. تَجد التغيير في `/super-admin/audit` (DiffViewer يَعرض القيم القديمة vs الجديدة).

---

## 4. super_admin — مراقبة المنصة

### `/super-admin` (الـ dashboard)

8 cards + alert banner:
- إجمالي العمارات، النشطة، في التجربة، المنتهية، الملغاة
- إجمالي المستخدمين، إجمالي الشقق، إجمالي المدفوعات المعتمدة (SAR)
- إن كان `trials_expiring_soon > 0` (أي عمارات تَنتهي تجربتها خلال 7 أيام): banner تحذيري + قائمة العمارات بالأسبقية.

### `/super-admin/users`

كل المستخدمين على المنصة:
- الاسم + رقم الجوال + عدد العمارات التي يَنتمي إليها + علامة super_admin إن وُجدت + تاريخ الانضمام.
- بحث بالاسم.

### `/super-admin/audit`

كل التغييرات الحساسة عبر كل العمارات:
- الوقت + اسم العمارة + نوع العملية (INSERT/UPDATE/DELETE) + النوع (entity_type) + المُنفِّذ + DiffViewer.
- pagination cursor-based (50 سجل/صفحة).
- Audit logs **immutable** — لا يُمكن تعديلها أو حذفها (immutability triggers تَحميها).

---

## 5. admin — إنشاء عمارة جديدة

### المسار

1. سجِّل حساباً جديداً عبر `/register`.
2. ستُحوَّل تلقائياً إلى `/onboarding`.
3. اضغط "تسجيل عمارة جديدة" → عبِّئ:
   - **اسم العمارة** (إلزامي)
   - **العنوان** (إلزامي)
   - **المدينة**
   - **الرسوم الشهرية الافتراضية للشقة** (SAR)
   - **العملة** (افتراضي: SAR)
4. اضغط "حفظ" → الـ RPC `register_building` يُنشئ:
   - صف في `buildings` (subscription_plan='trial'، subscription_status='trial'، trial_ends_at=now+30d)
   - عضوية لك بدور `admin`
5. يُحوَّل تلقائياً إلى `/dashboard` كمدير العمارة.

كل العملية ذرّية (atomic) — إن فشل أي جزء، لا تُنشَأ العمارة جزئياً.

---

## 6. admin — إدارة الشقق والسكان

### إضافة شقة

`/apartments` → "شقة جديدة":
- رقم الشقة + الطابق + الرسوم الشهرية + ملاحظات.
- الحالة الافتراضية: `vacant` (شاغرة).

### ربط ساكن بشقة (أو دعوته)

من تفاصيل الشقة → "إضافة عضو":
- **أَدخل بريد الساكن** (إلزامي).
- **اسم الساكن** (اختياري — يَظهر في الدعوة الجديدة فقط).
- **اختر العلاقة**: `owner` / `resident` / `representative`.

عند الضغط على "ربط / دعوة":

1. **إن كان البريد مُسجَّلاً سابقاً** (مثلاً سَكن آخر سجَّل بنفسه عبر `/register`، أو ساكن سابق في عمارة أخرى): يُربط مباشرة. تَظهر رسالة "تم ربط الشخص بالشقة".

2. **إن لم يَكن مُسجَّلاً**: Supabase يُرسل دعوة بريدية تلقائياً عبر `auth.admin.inviteUserByEmail`. الساكن يَستلم رسالة فيها رابط، يَضغطه، يَضع كلمة مرور، ثم يَدخل وهو **مَربوط بالشقة بالفعل**. تَظهر رسالة "تم إرسال الدعوة وربط الشخص بالشقة".

كلا المسارَين يَستخدمان نفس RPC `link_apartment_member` تحت جلسة admin — لذلك audit_logs يُسجِّل **admin** كـ actor وليس service_role.

#### ملاحظات تشغيلية

- **`SUPABASE_SERVICE_ROLE_KEY` مطلوب في البيئة** ليَعمل مسار الدعوة. في Vercel: Project Settings → Environment Variables. لو غاب، الدعوة تَفشل برسالة "تعذّر إرسال الدعوة".
- **أول عضو يَنضم للشقة يَصبح ممثل التصويت تلقائياً**. يُمكن تَغيير ذلك لاحقاً عبر "تَغيير ممثل التصويت".
- الدعوة تُرسَل من بريد Supabase الافتراضي. للحصول على بريد مُخصَّص (`noreply@your-domain.com`)، اضبط **SMTP custom** من Supabase Dashboard → Authentication → SMTP Settings.

### تغيير ممثل التصويت

من تفاصيل الشقة → اختر العضو الجديد → "تعيين ممثل تصويت":
- العملية ذرّية: العضو القديم يَفقد العلامة، العضو الجديد يَكتسبها.
- في التصويتات النشطة، التحديث يَنعكس فوراً (RPC `list_user_vote_apartments` يَستخدم state حالية).

### تعطيل ساكن (deactivate)

من قائمة أعضاء الشقة → "تعطيل":
- إن كان ممثل التصويت، **لا تَستطيع تعطيله بدون استبدال** (RPC `deactivate_apartment_member` يَفرض ذلك).
- إن أَعَدت تفعيل عضو سابق كان admin، سيَعود بدور `resident` (لا role escalation تلقائي).

---

## 7. admin — المدفوعات الشهرية

### دورة حياة الدفعة

```
ساكن يَرفع إيصالاً → status='pending' → admin/treasurer يَعتمد أو يَرفض
```

### اعتماد دفعة

`/payments` → "بانتظار الاعتماد" → اختر دفعة → "اعتماد":
- الـ trigger يَفحص الإيصال موجود (`receipt_url` غير فارغ).
- تُحفظ `approved_by` و `approved_at` تلقائياً.
- audit log يَلتقط التغيير.

### رفض دفعة

نفس المسار → "رفض" → أَدخل سبب الرفض (3 أحرف على الأقل):
- السبب يَظهر للساكن (يَعرف ماذا يُصلح).
- يُسجَّل في audit_logs.

### رفع دفعة باسم ساكن (admin proxy)

أحياناً ساكن يَدفع كاش — admin يَرفع نيابة:
- `/payments/new` → اختر "ساكن آخر" → ابحث عنه → ارفع الإيصال.
- يَذهب مباشرة إلى `pending` (admin نفسه يَعتمدها لاحقاً).

### عرض المدفوعات

`/payments` يَعرض جدولاً مع فلاتر:
- الحالة + الشهر + الشقة + الساكن.
- مجاميع: عدد المعتمدة + إجمالي SAR.

---

## 8. admin — المصروفات والمزودون

### المزودون

`/vendors` — قائمة شركات الصيانة، التنظيف، الأمن، إلخ.
- الاسم + الجوال + التقييم (1-5 نجوم) + ملاحظات + is_active.
- لا يُمكن تَعديل `building_id` بعد الإنشاء (tenant lock).

### دورة حياة المصروف

```
draft → pending_review → approved → paid (terminal)
                       ↘ rejected → cancelled (terminal)
```

### إنشاء مصروف

`/expenses/new`:
- العنوان + المبلغ + الفئة (تنظيف / صيانة / أمن / مرافق / أخرى) + التاريخ + المزود (اختياري).
- ارفع فاتورة (`invoice_url`) — مطلوبة للانتقال إلى `paid`.
- الحالة الافتراضية: `draft`.

### قبول مصروف

من `/expenses/[id]` → "إرسال للمراجعة" → "اعتماد" → "تسجيل الدفع":
- في خطوة `paid`: يَجب وجود `paid_by` و `paid_at` و `invoice_url` (chk_expenses_paid_proof).
- بعد `paid`، **الصف مُجمَّد** — لا تَعديل لـ amount/title/invoice_url/paid_at.

### رفض مصروف

من `pending_review` → "رفض" → اكتب سبب الرفض:
- ينتقل إلى `rejected`.
- يُمكن العودة منه إلى `draft` (round trip) أو `cancelled` (terminal).

---

## 9. admin — الصيانة والمهام

### دورة حياة طلب الصيانة (8 حالات)

```
new → reviewing → waiting_quote → waiting_approval → in_progress → completed
                                                                ↘ rejected → reopened
```

### إنشاء طلب

السكان يَفتحون من `/maintenance/new`. admin يَفتح نيابة عن ساكن:
- الموقع (شقة / مدخل / مصعد / سطح / موقف / أخرى)
- الأولوية (low / medium / high / urgent)
- الوصف + صور قبل (اختياري لكن موصى به).

### تعيين فني + cost

من تفاصيل الطلب (`reviewing` →) "تعيين":
- اختر فني من building_memberships role='technician'.
- أَدخل التكلفة المُقدَّرة + ملاحظات → ينتقل إلى `waiting_approval`.

### اعتماد العمل

من `waiting_approval` → "اعتماد" → ينتقل إلى `in_progress`.
- الفني يَستلم إشعاراً (في تَطوير لاحق).

### إكمال الطلب

الفني (أو admin) من `in_progress` → "إكمال":
- يَجب رفع `after_image_url` (دليل إكمال — Codex round 1 P1).
- `completed_at` يُختَم تلقائياً.

### ربط بمصروف

طلب `completed` يُمكن ربطه بمصروف (للتتبع المالي):
- "ربط بمصروف" → اختر مصروف موجود (أو أنشئ جديداً).
- العملية ذرّية عبر RPC `link_maintenance_to_expense` — لا يُمكن ربط أكثر من مرة.

### المهام (للإدارة الداخلية)

`/tasks` — لوحة Kanban بـ 4 حالات (`todo`, `in_progress`, `waiting_external`, `completed`):
- العنوان + المُسنَد إليه + الأولوية + due_date.
- `overdue` يُحسب تلقائياً عبر CHECK constraint (لا يُسمح بـ INSERT/UPDATE مباشرة بحالة overdue).

---

## 10. admin — التصويتات والقرارات

### الاقتراحات (suggestions)

السكان يَرفعون اقتراحات في `/suggestions/new`. admin يُحوِّلها إلى:
- `discussion` — مرحلة نقاش
- `pricing` — جمع عروض
- `converted_to_vote` — تَحويل لتصويت رسمي
- `approved` / `rejected` / `archived`

⚠️ **مؤلف الاقتراح لا يَستطيع تَغيير حالته بنفسه** — حماية من escalation.

### تَحويل اقتراح إلى تصويت

من تفاصيل الاقتراح → "تحويل لتصويت":
- اضبط: العنوان + الوصف + خيارات (≥ 2) + تاريخ الإغلاق + قاعدة الموافقة (simple_majority / two_thirds / custom).
- الـ RPC `convert_suggestion_to_vote` يُنشئ vote + options + يُحدِّث الاقتراح إلى `converted_to_vote` ذرّياً.

### تفعيل تصويت

`/votes/[id]` (في حالة `draft`) → "تفعيل":
- ينتقل إلى `active`.
- **لا يُمكن تَعديل options بعد التفعيل** (Phase 10 round 2 P1).
- starts_at تَقدر تَتغيَّر مع activation (مرونة legitimate).

### التصويت

ممثل الشقة فقط يُصوِّت (RPC `cast_vote_for_apartment`):
- الإجابة وحيدة لكل شقة (UNIQUE constraint).
- لا يُمكن التصويت بعد الإغلاق.
- vote_responses **immutable once cast** — لا تَعديل، لا حذف.

### رؤية النتائج

- خلال التصويت النشط: admin يَرى الـ aggregate counts (totals لكل خيار). resident **لا يَرى** التفاصيل (privacy).
- بعد الإغلاق: الجميع يَرى aggregate counts.
- **raw responses** (مَن صوَّت ماذا): admin فقط، عبر RPC مخصَّص — وحتى هو لا يَستطيع رؤيتها قبل الإغلاق.

### تسجيل قرار

من تصويت `closed` → "تسجيل قرار":
- الحالة (approved / rejected / implemented / postponed)
- ملخص القرار + التفاصيل + تاريخ التنفيذ.
- يُحفظ في `decisions` مع `vote_id` (يُمكن تَسجيل قرار بدون vote — مثلاً قرار إداري).

---

## 11. admin — التقارير المالية

### `/reports/financial`

اختر **شهر** أو **نطاق مخصَّص**:

#### Monthly summary
- الدخل (مدفوعات معتمدة في فترة `period_month`)
- المصروف (مصروفات `paid` في `period_month`)
- الرصيد = الدخل - المصروف
- عدد الشقق المتأخرة (لم تَدفع لهذا الشهر)
- عدد العمليات (income_count + expense_count)

#### Expense breakdown
دائرة pie تَعرض المصروفات حسب الفئة (تنظيف / صيانة / أمن / ...).

#### Yearly trend
12 شهر بأعمدة line chart: الدخل + المصروف لكل شهر + counts.

#### Range summary (مخصَّص)
نفس monthly لكن لنطاق `from_period` إلى `to_period` (يَستخدم `period_month`، ليس `payment_date` — لـ consistency).

### الخصوصية

كل الـ RPCs الأربع SECURITY DEFINER + role check:
- admin / treasurer / committee: يَرون.
- resident / technician: **لا يَرون** (RPC يَرفض بـ access denied).

---

## 12. admin — سجل النشاطات (Audit)

`/audit-logs` يَعرض كل التغييرات الحساسة في عمارتك:
- الوقت + العملية + العنصر + المُنفِّذ + DiffViewer (red للقيمة القديمة، green للجديدة).
- فلاتر: الكيان (entity_type) + العملية (action) + المُنفِّذ + النطاق الزمني.

### كيف يَعمل؟

كل INSERT/UPDATE/DELETE على الجداول الحساسة يُطلق trigger يُسجِّل صفاً في `audit_logs`:
- `building_id` + `entity_type` (`payment`, `expense`, `maintenance`, ...)
- `entity_id` + `action` (INSERT/UPDATE/DELETE)
- `actor_id` (مَن نفَّذ) + `old_values` + `new_values` (JSONB)
- `notes` (اختياري — يَكتبه الـ trigger أو الـ RPC)

### الـ immutability

`audit_logs` **لا يُمكن تَعديلها أو حذفها** — triggers تَرفض. هذا حماية ضد الـ tampering.

في الإنتاج، احذف الـ logs القديمة (> سنة) عبر cron + service_role منفصل، أو لا تَحذف وارفع للـ Supabase Pro.

---

## 13. مفاهيم متقدِّمة

### tenant lock
كل صف في الجداول الحساسة (apartments, payments, expenses, maintenance, vendors, votes, ...) له `building_id` غير قابل للتعديل بعد الإنشاء. الـ trigger يَرفض UPDATE يُحاول تَغييره. هذا يَمنع أي محاولة لـ "نقل" بيانات بين tenants.

### composite FKs
كل علاقة بين جداول لها `building_id` تَستخدم composite FK:
```sql
foreign key (building_id, apartment_id)
  references apartments (building_id, id)
```
هذا يَضمن أن الـ child دائماً يَنتمي لنفس الـ tenant كالـ parent. الـ FK البسيط `apartment_id → id` لا يَكفي.

### workflow triggers
كل جدول له حالات (payments, expenses, maintenance, votes, suggestions, decisions) محمي بـ trigger يَفحص:
- **transition whitelist**: لا انتقال غير مسموح.
- **field whitelist per-transition**: تعديل description عند rejection مسموح، عند approval ليس مسموحاً.
- **terminal states**: paid, completed, cancelled — لا تَعديلات بعدها.

### path-aware tenant fallback (Phase 14 round 3)
لو المستخدم له عمارات متعدِّدة، والكوكي يُشير لعمارة منتهية، الـ middleware يُبدِّل تلقائياً لعمارة نشطة. للمسارات admin-only (مثل `/apartments`)، يُفضِّل عمارة نشطة بدور admin قبل أي بديل.

### Service Worker offline
التطبيق PWA — يُمكن تَثبيته على iOS/Android كأيقونة شاشة. عند انقطاع الإنترنت، صفحة الـ offline ستاتيكية تَظهر. الصفحات المُصادَقة لا تُكاش (privacy في multi-tenant).

---

## استكشاف مشاكل شائعة

### "الانتقال غير صالح" عند تَعديل اشتراك
الـ DB trigger يَفرض whitelist. مثلاً `expired → past_due` غير مسموح. الحل: مرّ عبر `active` أولاً (`expired → active → past_due`).

### "العضو لا يُمكن إزالته" عند تَعطيل ممثل تصويت
ممثل التصويت لا يُمكن تَركه فارغاً. عيِّن بديلاً قبل التَعطيل، أو استخدم RPC `change_voting_representative` لتمرير العضوَين معاً.

### الساكن لا يَرى دفعته
- تأكَّد `building_id` في الدفعة يُطابق عمارته.
- تأكَّد `apartment_id` يُطابق شقته (RLS يَفحص apartment_members).
- تأكَّد العضو is_active=true.

### admin يَرى عمارة منتهية فقط
لو كل عماراته subscription_status=expired/cancelled:
- middleware سيَحجبه على `/subscription-inactive`.
- هذا قرار super_admin لتَعطيل.
- التواصل مع super_admin للـ reactivation.

---

## ملخص

```
super_admin = مالك المنصة (يدوي عبر SQL، يَدير كل العمارات)
admin       = مدير عمارة (UI كاملة، اعتماد دفعات، إدارة سكان، إلخ)
```

كل العمليات الحساسة:
- محمية بـ RLS + workflow triggers
- مُسجَّلة في audit_logs
- ذرّية (atomic) عبر RPCs
- multi-tenant safe (composite FKs + tenant locks)
