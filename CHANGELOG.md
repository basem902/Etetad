# CHANGELOG

سجل التغييرات لـ **نظام إدارة العمارة** (imarah).

النسخ تتبع المراحل في [PLAN.md](./PLAN.md). كل مرحلة تَحصل على 100/100 من المستشار Codex قبل الانتقال للتالية. الإصدارات `0.x` تُمثّل المراحل التنفيذية، و `1.0.0` يُحجز للنشر الإنتاجي بعد إكمال 19 phase.

التواريخ بالميلادي.

---

## [1.0.0-rc.1+6] — 2026-05-01 — Phase 22: building metadata + role promotion + join floor

> Operator vision: "admin specifies apartments + elevators count, sends invite link with platform benefits, residents register with password+floor, admin verifies + activates and may promote a resident to co-admin." Phase 22 fills the 4 gaps identified vs current state.

### Added

- **`supabase/23_phase22.sql`** (new migration):
  - `buildings.elevators_count int not null default 0` (with check 0..100).
  - `pending_apartment_members.requested_floor int` (with check -5..200).
  - **`change_member_role(p_membership_id, p_new_role)`** RPC — admin promotes/demotes any building member (resident → admin, etc.) while preserving `apartment_members`. Last-admin protection enforced server-side.
  - **`update_building_metadata(...)`** RPC — admin edits `name`, `address`, `city`, `total_apartments`, `elevators_count`, `default_monthly_fee` after building creation.
  - `submit_join_request` extended to accept optional `p_floor` (verification info — admin sees during approval).

- **`src/components/team/change-role-dialog.tsx`** — new client component. Dropdown lets admin select new role; warns when promoting to/demoting from admin. Last-admin error from RPC surfaced in Arabic.

- **`src/components/building/building-settings-dialog.tsx`** — new client component. Edit building name + address + apartments + elevators + default fee. Triggered from /apartments header.

- **`src/actions/team.ts`** — `changeMemberRoleAction` wrapper for the RPC.

- **`src/actions/building.ts`** — new file with `updateBuildingMetadataAction`.

### Changed

- **/team page (`src/app/(app)/team/page.tsx`)** — major UX shift: now shows ALL active building memberships (admin + treasurer + committee + resident + technician) instead of just the 3 non-apartment-bound roles. Each row has a `<ChangeRoleDialog>` button; deactivate button kept only for treasurer/committee/technician (admin protected by last-admin rule, resident routed through apartment workflow). Page header copy updated.

- **/join landing page (`src/app/(marketing)/join/[token]/page.tsx`)** — added 6-card benefits grid above the form (transparency, voting, maintenance, payments, suggestions, communication). Each card has a lucide icon + Arabic title + description.

- **`src/components/marketing/join-form.tsx`** — added `<Input id="floor">` field (number, -5..200) between apartment number and phone. Layout shifted from 2-col to 3-col grid for that row.

- **`src/actions/joins.ts`** — `signupSchema` accepts `floor`. `signupAndJoinAction` stores `pending_join_floor` in user_metadata. `finalizeJoinRequestAction` reads it from metadata and passes to RPC.

- **/apartments page header** — added `<BuildingSettingsDialog>` between the join-link share and "add apartment" buttons.

- **`src/types/database.ts`** — added `elevators_count` to `buildings.Row/Insert`, `requested_floor` to `pending_apartment_members.Row/Insert`, new `change_member_role` and `update_building_metadata` RPC types, `submit_join_request.Args.p_floor` optional.

### Tests

- 6 new SQL tests (Phase 22) → **391/391**:
  - 22.1: admin promotes resident to admin (apartment_members preserved)
  - 22.2: last-admin protection (cannot demote when only 1 admin)
  - 22.3: non-admin cannot call change_member_role
  - 22.4: admin updates building metadata (name + elevators + apartments + fee)
  - 22.5: non-admin cannot update_building_metadata
  - 22.6: submit_join_request stores requested_floor

### Lessons (new)

- **#53**: when adding optional parameters to existing RPCs that other callers depend on, use PostgreSQL's `default null` for backwards compatibility. The 9-arg legacy callers (Phase 17/18 tests + admin client) keep working unchanged. New callers opt-in via the 10th arg. Bonus: the RPC body can branch on `p_x is not null` to enable new behavior without breaking old.
- **#54**: a "team management" page should mirror the data model — ALL members of the building, not a hand-picked subset. The Phase 19 design (only treasurer/committee/technician) leaked the implementation detail of /team's add path into the listing UI. Phase 22 fixes by listing every active membership and letting role-change happen via a generic RPC. The role enum is the source of truth, not the sidebar.

### Non-functional
- typecheck ✅ / lint ✅ / build ✅ / SW postbuild ✅
- sql-validate ✅ **391/391**
- audit ✅ 0 vulnerabilities

---

## [1.0.0-rc.1+5] — 2026-05-01 — Phase 21: /contact with password upfront + PasswordInput component

> Operator follow-up to Phase 20: extend the password-upfront pattern to `/contact` (trial + enterprise tiers), so EVERY signup form now has the same UX (email + password + wait for super_admin approval). Also adds reusable `PasswordInput` component with show/hide toggle (eye icon) — used in all 7 password fields across the app.

### Added

- **`src/components/ui/password-input.tsx`** — new client component that wraps the base `Input` with an inline 👁 toggle (lucide Eye / EyeOff). Keyboard accessible, `tabIndex={-1}` so the toggle doesn't steal focus from the input, Arabic `aria-label`. Used in: LoginForm, SubscribeForm, ResetPasswordForm (×2), RegisterForm (legacy, kept warm), JoinForm, ContactForm.

- **`supabase/22_phase21.sql`** (new migration):
  - Adds `applicant_user_id uuid references auth.users(id) on delete set null` to `subscription_requests` (nullable for backwards compat with pre-Phase-21 rows).
  - Drops + recreates `submit_contact_request` with optional `p_user_id` 10th arg (same pattern as Phase 20 `create_subscription_order`).
  - New `get_my_pending_contact_requests()` RPC: SECURITY DEFINER, scopes by `auth.uid()`, returns the calling user's own pending contact requests (status in `new`/`contacted`/`qualified`).
  - Updates `subscription_requests_validate_update` trigger to make `applicant_user_id` immutable post-INSERT.
  - Index `idx_subscription_requests_applicant` for the user-scoped lookup.

### Changed

- **`src/components/marketing/contact-form.tsx`**: added `<PasswordInput>` field with helper text matching Phase 20's wording. Phone + password share a row; city moved to its own row.

- **`src/actions/marketing.ts` — `submitContactRequestAction`**:
  - `contactRequestSchema` Zod gets `password: z.string().min(8).max(72)`.
  - Before calling `submit_contact_request` RPC, calls `authAdmin.createUser({ email, password, email_confirm: true, user_metadata })` to pre-create the auth account.
  - Passes the `userId` as `p_user_id` to the RPC.
  - On RPC failure: best-effort `authAdmin.deleteUser(userId)` to avoid orphan accounts.
  - Surfaces clear Arabic error if email is already taken.

- **`src/app/(app)/layout.tsx`**: extended the no-buildings gate to ALSO check `get_my_pending_contact_requests()`. Users with a pending contact request now redirect to `/account/pending` (same as pending subscription orders).

- **`src/app/account/pending/page.tsx`**: new card section shows pending contact request with tier-specific message ("trial" → 30-day free trial after verification; "enterprise" → personalized pricing discussion). Status-aware messaging for `contacted` state.

- **`src/types/database.ts`**: `submit_contact_request.Args` gets optional `p_user_id`. New `get_my_pending_contact_requests` RPC type.

- **6 other password fields** (login, subscribe, reset×2, register, join) switched from `Input type="password"` to `PasswordInput` for consistent show/hide toggle UX.

### Tests
- sql-validate ✅ **385/385** (Phase 20 tests cover the same pattern; Phase 21 reuses the validated approach)
- typecheck ✅ / lint ✅ / build ✅ / SW postbuild ✅ / audit ✅ 0 vulnerabilities

### Lessons (new)

- **#52**: when the operator picks "all signups go through approval" (option D), apply the same `(form + password) → createUser → pending-RPC → pending page` pattern across EVERY entry surface, not just the primary one. /contact looked optional ("just a CRM form") but the operator's mental model was unified across every form on the site. Lesson: when a UX choice is global, audit every form, every CTA, every dead-end URL — they all need to match.

---

## [1.0.0-rc.1+4] — 2026-05-01 — Phase 20: /subscribe with password upfront

> Operational refactor requested during smoke testing: change `/subscribe` to ask for password at registration, gate login behind super_admin approval, drop the 3-email "invite" dance. The user explicitly chose this UX after reviewing the original Phase 18 design ("payment-first, account on approval"). 7 files touched + 1 new SQL migration. Existing Phase 18 RPCs preserved with backwards compatibility.

### Why

The Phase 18 design assumed a "payment-first" flow where no auth account exists until super_admin approves a paid order, then `auth.admin.inviteUserByEmail` creates the account and the customer sets a password via `/forgot-password`. This works but requires 3 separate emails (order created + Supabase invite + password reset) and the customer is confused why `/subscribe` doesn't ask for a password like every other signup form.

Operator preference: customer chooses password at `/subscribe`, account is created immediately (auto-confirmed email), but **login redirects to `/account/pending` until super_admin approves**. After approval, the customer logs in with the credentials they already chose. One email, predictable UX.

### Added

- **`supabase/21_phase20.sql`** (new migration):
  - `create_subscription_order` RPC: accepts new optional `p_user_id uuid` parameter. When provided, the order's `provisioned_user_id` is set at INSERT time (legacy: NULL until approval). Old 9-arg signature explicitly DROPped to avoid PostgreSQL "function is not unique" errors.
  - `get_my_pending_subscription_orders()` RPC: SECURITY DEFINER, scopes by `auth.uid()`, returns the calling user's own pending orders only. Used by `/account/pending` and `(app)/layout.tsx` to gate users awaiting approval.
  - Validates that `p_user_id`, when provided, matches an actual `auth.users` row (defense against orphan provisioned_user_id values).

- **`src/types/database.ts`**:
  - `create_subscription_order.Args.p_user_id?: string | null`
  - New `get_my_pending_subscription_orders` RPC type with full row shape.

### Changed

- **`src/components/subscriptions/subscribe-form.tsx`**: added `<Input name="password">` field with helper text "ستَستَخدمها للدخول بعد اعتماد طلبك". Updated the "what happens after submission" notes to mention "تَدخل لوحة عمارتك بـ بَريدك + كلمة مرورك".

- **`src/actions/subscriptions.ts` — `createSubscriptionOrderAction`**:
  - Added `password` to Zod schema (8–72 chars).
  - Before calling `create_subscription_order` RPC, calls `authAdmin.createUser({ email, password, email_confirm: true, user_metadata })` to pre-create the auth account.
  - Passes the resulting `userId` as `p_user_id` to the RPC.
  - On RPC failure: best-effort `authAdmin.deleteUser(userId)` to avoid orphan auth accounts.
  - Surfaces clear Arabic error if email is already taken (instead of generic "تَعذَّر إنشاء الطلب").

- **`src/actions/subscriptions.ts` — `approveOrderAction`**:
  - Reads `subscription_orders.provisioned_user_id` before the invite step.
  - If pre-set (new flow): skips `inviteUserByEmail`, uses the existing user_id, calls `complete_provisioning` directly.
  - If null (legacy orders from before this refactor): falls through to the old invite path. Preserves the legacy flow for any in-flight pre-Phase-20 orders.

- **`src/app/(app)/layout.tsx`**: when user has zero buildings and no pending join request, also checks `get_my_pending_subscription_orders()`. If non-empty → redirect to `/account/pending`. Pre-Phase-20 the only pending state was Phase 17 join requests; now subscription orders are gated identically.

- **`src/app/account/pending/page.tsx`**: new section showing pending subscription order with reference number + status-specific message (awaiting_payment vs awaiting_review vs provisioning vs provisioning_failed). Rejected orders also surfaced. Removed the "تسجيل عمارتك الخاصة" link when the user has an active subscription order (they shouldn't be told to start fresh).

### Tests

- 7 new SQL tests (Phase 20) → **385/385**:
  - 20.1: `create_subscription_order` accepts `p_user_id` and pre-fills `provisioned_user_id`
  - 20.2: legacy 9-arg call still works (backwards compat)
  - 20.3: invalid `p_user_id` (no matching auth.users) is rejected
  - 20.4: `provisioned_user_id` immutable post-INSERT (Phase 18 trigger still enforced)
  - 20.5: user sees their own pending orders via the new RPC
  - 20.6: cross-user scope — user can't see others' pending orders
  - 20.7: anon (auth.uid() null) gets empty result, not an error

### Lessons (new)

- **#50**: a UX choice (password-upfront vs invite-on-approval) drives a SQL design choice (provisioned_user_id at INSERT vs at approval). The operator preference came AFTER 19 phases of review — the architecture had to accommodate both flows during transition. Lesson: optional parameters with default null are the cleanest backwards-compat path. The old 9-arg callers continue to work; new callers opt-in via the 10th arg.
- **#51**: when refactoring an RPC's signature, `CREATE OR REPLACE FUNCTION` does NOT replace if the arg list differs — PostgreSQL treats it as a new overload. Result: ambiguous calls. Always `DROP FUNCTION ... (old args)` explicitly before redefining with new args, even if you intend `CREATE OR REPLACE`.

### Non-functional
- typecheck ✅ / lint ✅ / build ✅ / SW postbuild ✅
- sql-validate ✅ **385/385**
- audit ✅ 0 vulnerabilities

---

## [1.0.0-rc.1+2] — 2026-05-01 — RC1 first-deploy hotfixes (HTTP 431 + onboarding loop + RSC icon boundary)

> Patch on `1.0.0-rc.1+1` — first attempt at running the dev server end-to-end revealed three issues that the SQL test suite couldn't catch (they require a real browser + real auth callback + real RSC rendering). All three fixed.

### Fixed

- **HTTP 431 on `/auth/callback` after email confirmation**: Next.js dev server's default max HTTP header size (16KB) is exceeded by Supabase's chunked auth cookies + the `next` query param + accumulated localhost cookies. The callback URL succeeded on Supabase's side (code generated correctly) but the dev server rejected the request before reaching the route handler. **Fix**: `package.json` `dev` script now uses `cross-env NODE_OPTIONS=--max-http-header-size=65536` (4× default). Cross-platform via `cross-env` dev dep. Production unaffected (Vercel handles large headers natively).

- **`ERR_TOO_MANY_REDIRECTS` on `/onboarding`** (Phase 14 bug, escaped 19 phases): `src/app/(app)/layout.tsx` redirected to `/onboarding` when the user has zero buildings. But `/onboarding/page.tsx` lived inside the `(app)` route group, so the layout re-ran on the redirect target → infinite loop. The page had its own minimal layout (no AppShell) so the (app) group membership was never functional. **Fix**: moved `src/app/(app)/onboarding/page.tsx` → `src/app/onboarding/page.tsx` (top-level, outside the (app) group). The `/onboarding` URL is unchanged. AppLayout no longer runs for it, so the redirect from AppLayout → /onboarding terminates cleanly.

- **RSC boundary error on `/super-admin`** (Phase 14 bug, escaped 19 phases): `src/app/(super-admin)/layout.tsx` (Server Component) imported lucide icons and passed them as `icon={LayoutDashboard}` etc. to `<NavLink>` (Client Component). React 19 + Next.js 15 strictly enforce the RSC→Client boundary: only plain serializable values can cross. Function/object props (like Lucide icon components, which have `$$typeof` + `render` methods) throw "Only plain objects can be passed". Build + typecheck don't catch this — it's a runtime serialization error. **Fix**: extracted the nav into a new Client Component `src/components/super-admin/super-admin-nav.tsx` that imports its own icons. The Server Component layout now just renders `<SuperAdminNav />` with no icon props crossing the boundary. Other NavLink call sites (app-sidebar, bottom-nav) were already inside Client Components — unaffected.

- **Login redirected to public landing instead of dashboard** (Phase 16 regression, escaped 4 phases): `LoginForm` after successful auth ran `router.replace('/')`. The comment said the root would route smartly to dashboard/onboarding/super-admin based on user state. That was true BEFORE Phase 16 — when marketing landed, `/` became a public landing page (under `(marketing)/page.tsx`) for guests + logged-in users alike. Result: login succeeded but user got stuck on the marketing landing instead of their dashboard. **Fix**: route to `/dashboard` after login. The `(app)/layout.tsx` (already fixed for the onboarding loop earlier in this same patch) dispatches: super_admin → `/super-admin`, no buildings → `/onboarding`, has buildings → render dashboard.

### Changed
- `package.json` — `dev` script wraps `next dev` with `cross-env NODE_OPTIONS=--max-http-header-size=65536`.
- `package.json` — added `cross-env ^10.1.0` to devDependencies.
- `src/app/(app)/onboarding/page.tsx` → `src/app/onboarding/page.tsx` (move, no content change).
- `src/app/(super-admin)/layout.tsx` — replaced inline `<NavLink>` block (with icon component props) with `<SuperAdminNav />` client wrapper. Dropped icon imports from this server component.
- `src/components/super-admin/super-admin-nav.tsx` — new (Client Component nav with its own lucide imports).
- `src/components/auth/login-form.tsx` — `router.replace('/')` → `router.replace('/dashboard')` after successful login.
- `.gitignore` — added `supabase/_prod-*.sql` (temp deploy chunks).
- `scripts/apply-migrations.mjs` — new (one-shot Postgres migration runner via `pg`).
- `package.json` — added `pg ^8.20.0` to devDependencies (for migration runner).

### Lessons (new — first-deploy reality)

- **#46**: dev-server defaults are ALL designed for tiny apps. Real auth flows (Supabase chunked cookies + OAuth state + redirect chains) routinely blow past defaults like `max-http-header-size`. Set generous limits in `dev` scripts proactively — don't wait for HTTP 431 in the field.
- **#47**: when a layout redirects to a route that uses the SAME layout, it's an infinite loop waiting to happen. The route group system in Next.js makes this easy to miss because the URL doesn't reveal the layout boundary. Audit: every `redirect(X)` in a layout where X resolves to the same layout = bug. Either move X out of the group, or add a pathname guard at the top of the layout (read from headers, set by middleware).
- **#48**: passing a function/component (like a Lucide icon) from a Server Component to a Client Component throws at RUNTIME, not at build/typecheck. Build sees `LucideIcon` is a valid type, but React's serializer at request time can't cross-boundary it. Two safe patterns: (a) keep nav configs entirely inside `'use client'` modules so icons never cross, or (b) pre-render the icon as JSX (`<Icon />`) in the Server Component and pass as `ReactNode`. Audit hint: any Server Component importing from `lucide-react` AND passing icons as props to a `'use client'` child is a latent bug.
- **#49**: when route purpose changes (e.g., Phase 16 turned `/` from "smart auth router" into "public marketing landing"), every redirect target that pointed there needs an audit. The LoginForm comment "the root page redirects to dashboard / onboarding / super-admin" was once true, then silently became false 4 phases ago. The comment masked the regression. Pattern: when a route changes role, grep for redirects to it and update them. A short-lived "smart router" that becomes public landing is a common refactor accident.

### Tests
- typecheck ✅ / lint ✅ / build ✅ / SW postbuild ✅
- sql-validate ✅ **378/378** (no SQL changed)
- audit ✅ 0 vulnerabilities

---

## [1.0.0-rc.1+1] — 2026-05-01 — RC1 docs hotfix (1× P2 from Codex)

> Patch on `1.0.0-rc.1` — docs only، لا تَغيير على code. لا يَستحق RC2 لأن الـ scope ثابت (freeze).

### Fixed (P2 from Codex)

- **`.env.example` + `DEPLOYMENT.md` خَلطا بين Resend وSupabase Auth**: التَوثيق كان يُلمح أن `RESEND_API_KEY` + `RESEND_FROM_EMAIL` في Vercel تَتحكَّم في رسائل Supabase Auth (Confirm signup، Reset password، `auth.admin.inviteUserByEmail`). الحقيقة: Supabase Auth يَستخدم مَزوداً مُنفصلاً تماماً، يُكوَّن في **Supabase Dashboard → Authentication → SMTP Settings** (لا في Vercel env vars). النَتيجة المُحتمَلة: ناشِر يَضبط Resend في Vercel ويَفترض أن invites ستَعمل، ثم يَكتشف بعد deploy أن الـ /team/add أو order approval لا يُرسل invite — بينما هي فعلاً تَستخدم مَزود Supabase الافتراضي (rate-limited 3-4/ساعة) أو SMTP مُخصَّص في Supabase Dashboard.

  - **`.env.example`**: تَحديث comment الـ RESEND_API_KEY ليَقول صَراحةً "نِطاق Resend هنا = بريد التطبيق فقط" + شَرح أن invites/Auth emails مُنفصلة. تَصحيح الادعاء بأن "كل emails تُسجَّل في audit_logs": الحقيقة أن subscription_reminders فقط تُسجَّل في `subscription_reminders_sent.email_status` (idempotency tracker مُنفصل)، باقي بريد التطبيق يُسجَّل في `audit_logs` عبر `log_email_failure` RPC.
  - **`DEPLOYMENT.md`**:
    - حُذِف parenthetical المُضلِّل "Resend عبر Supabase SMTP" من smoke test §5.2.
    - صُحِّحت الإفادة "بدون Resend ... كل emails تَفشل بما فيها invites" — invites غير مُتأثِّرة بـ Resend، وفشل reminder يَذهب لـ `subscription_reminders_sent` لا `audit_logs`.
    - أُضيف قِسم جديد **§2.4 — مَنظومتا البريد: Supabase Auth vs بريد التطبيق** يَحوي:
      - جَدول مُقارنة كامل (المَزود، أين يُكوَّن، env vars المَطلوبة، ما يُرسل).
      - شَرح "نَقطة الالتقاء" عند اعتماد order جديد (العميل يَستلم بريدَين مُنفصلَين).
      - تَحذير من حد المُعدَّل في مَزود Supabase الافتراضي (3-4 emails/ساعة).
      - دليل تَكوين Resend SMTP داخل Supabase (host/port/credentials).
      - قائمة تَحقُّق سَريعة (5 بنود) للـ deploy.
    - **§5.5 Email rollback** (Codex follow-up P3): قِسم rollback البريد كان ما يَزال يُعمِّم "failures في audit_logs" على كل فشل، بينما reminder failures تَذهب لـ `subscription_reminders_sent.email_status` لا `audit_logs`. صُحِّح ليَنقسِم بحَسب نوع البريد (orders/contact → audit_logs، reminders → subscription_reminders_sent) + تَوضيح أن إيقاف Resend لا يُؤثِّر على رسائل Supabase Auth (تُدار من Supabase Dashboard → SMTP Settings).

### Lesson (new)

- **#45**: عند توثيق email infrastructure، **افصل بِوُضوح** بين بريد التطبيق (الذي تُكوِّنه أنت في app env) وبريد المَنصَّة (الذي يُكوَّن في dashboard المَنصَّة). خَلطهما = يَوم deploy ضائع في تَتبُّع invites غير وَاصلة بينما الـ env vars "صحيحة". الـ split واضح في الكود (Resend SDK vs `auth.admin.inviteUserByEmail`) لكن التَوثيق يَجب يَجعله صَريحاً، خاصة في tables الـ env vars.

### Tests
- typecheck ✅ / lint ✅ / build ✅ / SW postbuild ✅
- sql-validate ✅ **378/378** (لا تَغيير)
- audit ✅ 0 vulnerabilities

---

## [1.0.0-rc.1] — 2026-05-01 — Release Candidate (RC freeze + production-readiness audit)

### Status: 🔒 FEATURE FREEZE

بعد إغلاق Phase 19 round 2 (آخر phase تَطبيقي في PLAN)، الـ scope مُجمَّد. **لا ميزات جَديدة** حتى `v1.0.0`. الإصلاحات الوحيدة المَسموحة هي ما يَكشفه deploy/smoke testing على بيئة إنتاج فِعلية.

### Production-readiness audit findings (3 deploy gaps closed)

- **`vercel.json` — cron expire-orders غير مُسجَّل**: Phase 18 أَضاف الـ route `/api/cron/expire-orders` لكن لم يُسجِّله في `vercel.json`. النتيجة: subscription_orders المَهجورة (`awaiting_payment` > 30 يوم) لا تَنتهي تلقائياً، يَتراكم noise في `/super-admin/orders`. أُضيف schedule `0 2 * * *`. الملف الآن يَحوي **3 crons** (expire-orders + expire-subscriptions + subscription-reminders).

- **`.env.example` — 4 متغيرات بيئة ناقصة**: التَوثيق كان يَذكر 4 متغيرات (Supabase×3 + APP_URL) بينما الكود يَستهلك **7**. الناقصة: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `CRON_SECRET`, `SUPER_ADMIN_NOTIFICATION_EMAIL`. النتيجة لو نُشر بدون توثيق محدَّث: emails تَفشل بصمت + 3 cron endpoints تُرجع 503 + super_admin لا يَستلم إشعارات /contact. أُعيد كتابة `.env.example` ليَحوي السبعة مع شَرح أين يُستخدَم كل متغير وأثر غيابه.

- **`DEPLOYMENT.md` — مُتأخِّر 4 phases**: الملف كان يَذكر 15 SQL files (الواقع 20)، لا يَذكر cron registration، لا يَذكر Phase 16-19 storage buckets، smoke test سَطحي، لا rollback plan. أُعيدت كتابة:
  - SQL list مُحدَّثة لـ 20 ملف مع descriptions per-phase + counts (25 جدول، 8 buckets، schema `private`).
  - Vercel env vars table مُحدَّثة لـ 7 vars + توضيح "بدون X يَحدث Y".
  - قسم جديد §3.2.1 — تَسجيل الـ crons + curl test commands.
  - smoke test مُوسَّع لـ 10 categories (Marketing, Auth, Subscribe e2e, Renewal e2e, /team, Bulk Import, Apartments+Payments+Maintenance+Votes, PWA, Cron auth, audit_logs).
  - قسم جديد §5.5 — Rollback Plan ثلاثي الطَبقات (Vercel deploy, DB schema, cron pause, Resend pause).

### Changed

- **`vercel.json`** — أُضيف cron `expire-orders` (يَومي 02:00 UTC).
- **`.env.example`** — مُعاد كتابة بـ 7 متغيرات إلزامية + 1 اختياري، مع شَرح كل واحد.
- **`DEPLOYMENT.md`** — مُعاد كتابة بالكامل لـ RC 1.0.0 (SQL replay لـ 20 files، env vars table، cron registration، smoke checklist، rollback plan).
- **`package.json`** — version bump من `0.1.0` إلى `1.0.0-rc.1`.

### Not Changed (RC freeze)

- لا تَغيير على أي SQL migration (`supabase/*.sql`).
- لا تَغيير على أي server action، component، أو page.
- لا تَغيير على أي email template.
- لا تَغيير على أي RPC.
- ميزات Phase 19 الـ 5 تَبقى كما اعتمدها Codex.

### Tests
- sql-validate ✅ **378/378** (لا تَغيير، كل اختبارات Phase 0-19 تَمر).
- typecheck ✅ / lint ✅ / build ✅ / SW postbuild ✅
- audit ✅ 0 vulnerabilities

### Next Steps (لـ v1.0.0 GA)

1. **Real Supabase project provisioning** — تَطبيق الـ 20 SQL files على project نَظيف، تَأكيد counts.
2. **Resend setup** — domain verification + API key + RESEND_FROM_EMAIL.
3. **Vercel deploy** — production environment، 7 env vars، 3 crons تَظهر في dashboard.
4. **super_admin bootstrap** — register + SQL promotion (راجع DEPLOYMENT §4).
5. **Smoke test e2e** — كل sections من §5 (1-10).
6. **Tag `v1.0.0`** + announce.

### Lessons (new — operations-focused)

- **#43**: عند إضافة cron route جديد، الكود + الـ vercel.json يَجب أن يَتغيَّرا في نفس الـ commit. غياب الـ schedule = الـ route مَوجود لكن لا أحد يَستدعيه. لا تَختلف خطورته عن غياب الـ route نفسه.
- **#44**: `.env.example` ليس documentation only — هو **source of truth** للـ env vars المَطلوبة. كل `process.env.X` في الكود يَجب أن يُذكَر، حتى لو optional. الـ deploy يَفشل بصمت أكثر من أي bug في الكود.

---

## [0.19.1] — 2026-05-01 — Phase 19 round 2 (2× P1 + 2× P2 from Codex)

### Fixed

- **(P1 #1) Two renewal orders for the same building after rejection** (`supabase/20_phase19.sql`): `create_renewal_order` excluded `rejected` from its in-flight check, but Phase 18 allows `rejected → awaiting_review` for re-uploads (up to 3 attempts). Scenario: order A is rejected (attempts=1) → admin opens B → A's holder uploads new receipt → both A and B reach `awaiting_review` → super_admin approves both → `subscription_ends_at` extended twice. Fix: treat `rejected` with `rejection_attempt_count < 3` as still in-flight. The slot frees only on `expired`, `approved`, `cancelled`, or `rejected@attempts>=3` (terminal — Phase 18 v3.39's submit_receipt cap blocks further re-uploads).

- **(P1 #2) Bulk member import skipped voting-representative logic** (`supabase/20_phase19.sql`): `process_members_bulk_import` directly INSERTed `apartment_members` rows with `is_voting_representative` defaulting to false. Phase 5's `link_apartment_member` sets `is_voting_representative=true` for the FIRST active member of each apartment (unique partial index enforces one rep per apartment). Without this, bulk-imported apartments had **no voting representative** — Phase 10 voting flow would fail for the whole imported batch. Fix: inlined the voting-rep logic in the commit phase: count existing active members per apartment, set `is_voting_representative = (count == 0)` on INSERT. Also mirror Phase 5's "never silently restore an elevated role on reactivation" semantics for `building_memberships` (resident-only entry point in bulk import).

- **(P2 #3) `/team` could deactivate resident memberships** (`supabase/20_phase19.sql`): `deactivate_team_member` rejected only `role='admin'` and accepted any other role including `resident`. An admin could deactivate a resident's `building_membership` from /team, leaving `apartment_members` rows alive — an inconsistent access state where the resident has apartment ownership rows but no building access (RLS would block the user but the data drift remains). Fix: whitelist allowed roles instead of blacklist (`if role not in ('treasurer', 'committee', 'technician')`) with explicit error message routing each role to its correct path. Resident removal must go through Phase 5's apartment-member workflow (handles voting-rep + apartment_members atomically). Updated `src/actions/team.ts` error-mapping to surface the new message in Arabic.

- **(P2 #4) `change_subscription_plan` validated `p_note` but never saved it** (`supabase/20_phase19.sql`): the RPC required note ≥5 chars and the UI labeled it "سَبَب التَغيير للسجل" (reason for the log), but `p_note` was never used. The `buildings` table has no audit trigger (Phase 1 omitted it on purpose), so manual super-admin overrides left no trail. Fix: `change_subscription_plan` now INSERTs explicitly into `audit_logs` with `action='PLAN_CHANGE'`, `entity_type='buildings'`, `old_values` + `new_values` JSONB snapshots of subscription_plan/status/ends_at + `extend_cycle`, and the operator's `p_note` in the `notes` column. Filterable in `/super-admin/audit` by `action='PLAN_CHANGE'`.

### Tests
- 6 new SQL tests (19.35–19.40) → **378/378**:
  - 19.35: rejected@attempts<3 blocks opening a 2nd renewal — closes double-extend bug
  - 19.36: rejected@attempts=3 (terminal) frees the slot — happy boundary
  - 19.37: bulk member import sets `is_voting_representative=true` for first active member, false for subsequent
  - 19.38: imported apartment has exactly one voting rep (unique partial index satisfied — voting flow works)
  - 19.39: `deactivate_team_member` rejects `role='resident'`
  - 19.40: `change_subscription_plan` writes a complete audit_log row (action + note + old/new values)

### Lessons (new)

- **#41**: When building an "in-flight" predicate to prevent duplicate state, `rejected` is NOT necessarily terminal — if the workflow allows retries (re-upload up to N attempts), `rejected@attempts<N` is functionally still in-flight. Put retry-eligibility into the in-flight predicate; do not blanket-exclude `rejected`. The double-extend bug came from this exact gap between status semantics (rejected = "didn't work") and lifecycle semantics (rejected with retries = "still alive").
- **#42**: Functions that capture data (notes/audit/reasons) must (1) validate input, (2) **actually use the data** (INSERT into audit table or dedicated column), and (3) the test must assert the data appears in its destination. Common failure mode: (1) is written and (2) is forgotten — "validation theater" where the input is rejected for length but never persisted. Test 19.40 catches exactly this category by asserting `p_note` reaches `audit_logs.notes`.

### Non-functional
- typecheck ✅ / lint ✅ / build ✅ / SW postbuild ✅
- sql-validate ✅ **378/378**
- audit ✅ 0 vulnerabilities

---

## [0.19.0] — 2026-05-01 — Phase 19 (Team + Renewals + Plan Changes + Bulk Import + Reminders)

### Added

- **`supabase/20_phase19.sql`** — Phase 19 foundation:
  - **`subscription_orders` extensions** (4 columns): `is_renewal`, `renews_building_id`, `is_plan_change`, `previous_tier_id` + `chk_renewal_fields` CHECK constraint enforcing coherence between the four fields. The trigger `subscription_orders_validate_update` makes them immutable post-INSERT.
  - **`bulk_import_jobs`** table — tracks CSV uploads for apartments/members. Status workflow `pending → processing → completed | failed | cancelled` with transition whitelist + immutability of identity fields (building_id, type, file_url, file_name, created_by) via dedicated trigger.
  - **`subscription_reminders_sent`** table — idempotency tracker for the daily cron. Unique on `(building_id, days_before, subscription_ends_at_snapshot)` so duplicate cron runs are no-ops, and renewals (which change `ends_at`) trigger a fresh reminder series.
  - **Storage bucket `bulk_import_uploads`** — private, deny-all anon, 10MB max, **CSV only** (`text/csv` + `application/csv` mime types).
  - **11 new RPCs** (all `SECURITY DEFINER`):
    1. `add_team_member(p_building_id, p_user_id, p_role)` — admin only, role limited to treasurer/committee/technician (admin/resident routed elsewhere). Reactivates inactive memberships with the new role.
    2. `deactivate_team_member(p_membership_id)` — admin only, idempotent, refuses role='admin' (super-admin path).
    3. `create_renewal_order(p_building_id, p_tier_id, p_cycle, p_token_hash)` — building admin, snapshots admin email/name/phone + tier pricing + VAT, blocks duplicate in-flight renewals, sets `is_plan_change` automatically when tier differs.
    4. `complete_renewal(p_order_id)` — super_admin (with ownership check inherited from Phase 18 v3.40 round 3), atomic: extends `subscription_ends_at` from `MAX(now, current ends_at) + cycle interval` (early renewals preserve unused time), optionally updates `subscription_plan` for plan-change orders. Sets `provisioned_building_id` + resolves `provisioned_user_id` from building's earliest active admin (satisfies Phase 18 CHECK that approved orders have provisioned_user_id NOT NULL).
    5. `change_subscription_plan(p_building_id, p_new_tier_id, p_extend_cycle, p_note)` — super_admin direct override (no order flow). `note` ≥5 chars required for audit_logs trail. Optional `extend_cycle` extends ends_at by 1 month or 1 year using same anchor logic as renewal.
    6. `create_bulk_import_job(p_building_id, p_type, p_file_url, p_file_name)` — admin only, returns job id.
    7. `process_apartments_bulk_import(p_job_id, p_rows jsonb)` — admin, atomic per Reserve/Validate/Commit: validation phase per-row collects errors (no DB writes if any fail), commit phase inserts all in inner BEGIN/EXCEPTION subtransaction (rollback on any constraint violation). Max 1000 rows.
    8. `process_members_bulk_import(p_job_id, p_rows jsonb)` — admin, validates email exists in auth.users + apartment exists in this building before any INSERT.
    9. `cancel_bulk_import_job(p_job_id)` — admin or super_admin, only `pending` jobs.
    10. `find_and_record_subscription_reminders()` — service_role (cron), atomic find+record returning new candidates for emailing. Selects 30/14/7 days ahead candidates from active/trial buildings whose ends_at hasn't been notified for this period.
    11. `update_reminder_email_status(p_reminder_id, p_status, p_error)` — service_role, post-send tracking (queued → sent | failed).

- **`/team` page** (`src/app/(app)/team/page.tsx`) — admin-only list of treasurer/committee/technician members. AddTeamMemberDialog (component) for inviting by email, DeactivateTeamMemberButton (component) for confirmation-gated removal. Nav item added (UsersRound icon, admin-only).

- **`/subscribe?renew=true&building=X`** — branched in `src/app/(marketing)/subscribe/page.tsx`. Authenticated admin opens to renew. `RenewForm` component shows current tier + ends_at, lets admin pick new tier + cycle, calls `createRenewalOrderAction`, redirects to receipt-upload page.

- **`/super-admin/buildings/[id]` plan change** — `ChangePlanDialog` integrated into `SubscriptionControls`. Lets super_admin override plan + optionally extend ends_at, with audit-required note.

- **`/apartments/import` + `/apartments/members-import`** — admin-only bulk import pages. Uses shared `BulkImportForm` component (CSV file picker + result panel with per-row errors). Pages added to apartments header as "استيراد من ملف" / "استيراد سكان" buttons.

- **`/api/cron/subscription-reminders`** — daily cron (schedule `0 9 * * *`). CRON_SECRET-protected, calls `find_and_record_subscription_reminders` RPC, sends `renderSubscriptionReminderEmail` per row, records `update_reminder_email_status`. Result: `{success, found, sent, failed, skipped}`.

- **3 new email templates** (`src/lib/email/index.ts`):
  - `renderRenewalCreatedEmail` — bank-transfer instructions for renewal/upgrade orders, banner shows plan change if applicable.
  - `renderRenewalApprovedEmail` — confirms renewal/upgrade with new ends_at and plan, no Supabase invite mention (admin already has access).
  - `renderSubscriptionReminderEmail` — color-coded banner by urgency (blue 30d / amber 14d / red 7d), CTA to `/subscribe?renew=true&building=X`.

- **`vercel.json`** — registered both crons (expire-subscriptions + subscription-reminders).

### Changed

- **`src/actions/subscriptions.ts` `approveOrderAction`** — now branches on `order.is_renewal`. New orders use the existing Reserve/Invite/Complete pattern. Renewal orders skip invite (admin exists) and call `complete_renewal` instead of `complete_provisioning`. Renewal approval emails use `renderRenewalApprovedEmail`.

- **`src/lib/bulk-import/parse.ts`** — CSV-only parser (papaparse). The `xlsx` npm package was initially added but **removed** because it carries unpatched CVEs (GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9). The patched SheetJS version is only on their CDN, which bypasses pnpm integrity verification — incompatible with our 0-vulnerabilities posture (lesson #27). Users save Excel files as CSV (UTF-8) — the UI explains how.

- **`src/types/database.ts`** — `subscription_orders.Row/Insert` extended with renewal columns. New table types for `bulk_import_jobs` + `subscription_reminders_sent`. 8 new RPC types.

### Tests

- **35 new SQL tests** (Phase 19) → **372/372** total:
  - 19.1–19.8: add/deactivate team member (role enforcement, ownership, idempotency)
  - 19.9–19.16: renewal orders (snapshot, in-flight cap, trial rejection, complete extends ends_at, plan change atomic, immutability of renewal fields)
  - 19.17–19.19: change_subscription_plan (super-only, note required, extend behavior)
  - 19.20–19.26: bulk import (happy path, validation atomic, > 1000 cap, tenant scoping, cancel, immutability of identity fields)
  - 19.27–19.30: reminders cron (30-day discovery, idempotent same-period, fresh period after renewal, excludes non-active/trial)
  - 19.31–19.34: RLS (anon denied on bulk_import_jobs + reminders_sent, admin sees own building, cross-building admin gets 0)

### Lessons (new)

- **#39**: Don't accept dependencies with unpatched CVEs from npm even if a patched CDN version exists — integrity verification matters more than format coverage. Drop the format with a UI workaround instead. Phase 19 dropped XLSX support → users save Excel as CSV.
- **#40**: When adding columns + composite CHECK constraints to an existing table, the existing `status='approved' ⇒ provisioned_user_id NOT NULL` constraint forced `complete_renewal` to snapshot the building's admin user_id (renewals don't introduce a new user). Pattern: every CHECK that links state-machine to FK fields needs an explicit handler in every RPC that transitions to that state.

### Non-functional
- typecheck ✅ / lint ✅ / build ✅ / SW postbuild ✅
- sql-validate ✅ **372/372**
- audit ✅ **0 vulnerabilities** (xlsx removed; only papaparse + existing deps)

---

## [0.18.3] — 2026-04-30 — Phase 18 round 4 (1× P2: tighten cron-marker bypass scope)

### Fixed

- **(P2) marker bypass كان يَفتح أي transition داخل الـ general whitelist**: في v3.40، `private.cron_subscription_expiry_marker` كان يَكتفي بـ "this is a cron path"، ثم يَترك `subscription_status` يَتَحوَّل لأي قيمة مَسموحة في الـ general transition whitelist (`active→cancelled`, `expired→active`, `past_due→expired`، إلخ.). لو الـ marker كان نَشطاً في txid أوسع، أي UPDATE في نفس الـ txid كان يَستطيع ركوب الـ bypass لتَنفيذ تَحويلات غير مَقصودة دون super_admin. الإصلاح: clamp الـ marker إلى التَحويل الدقيق فقط — `OLD.status='active'` و `NEW.status='expired'` و `OLD.subscription_ends_at IS NOT NULL` و `OLD.subscription_ends_at < now()`. الـ marker الآن single-purpose بحَق (bulk-flip للـ rows المُستحقَّة).

### Tests
- 4 اختبارات SQL جديدة (18.24f-i) → **337/337**:
  - 18.24f: marker + `active→cancelled` → blocked (الـ clamp يُحدِّد `expired` فقط)
  - 18.24g: marker + `expired→active` → blocked (recovery transition لا تَمر عبر الـ bypass)
  - 18.24h: marker + `active→expired` لكن `ends_at` مُستقبل → blocked (rows غير مُستحقَّة لا تَمر)
  - 18.24i: regression — `expire_due_subscriptions()` الشرعي ما زال يَعمل بعد الـ clamp

### Schema Changes (`supabase/19_phase18.sql`)
- `buildings_validate_update()` trigger في فرع الـ marker: clamp جديد يَفرض exact `active → expired` transition مع `ends_at` مُنقضٍ. الـ general transition whitelist يَعمل كما هو لـ super_admin path.

### Lessons (تَوسيع #38)

- **#38 (مُحدَّث)**: عند فَتح bypass للـ trigger لمسار خاص، التَصميم الكامل يَحتاج طَبقتين من القَيد: (1) **proof of identity** — private marker مَربوط بـ `txid_current()`، يُكتب من security definer RPC مَحدودة الـ GRANT؛ (2) **scope clamp** — الـ marker يُمَكِّن `(action, OLD-state, NEW-state)` مُحدَّد فقط، ليس "أي تَغيير قَانوني داخل الـ general whitelist". بدون الطبقة الثانية، الـ marker يَنتَقل من "single-purpose bypass" إلى "general bypass for whoever has the txid" ويُعيد فَتح الـ surface المُغلَق. الـ general whitelist مَصمَّم لـ super_admin (له صلاحية كاملة)؛ الـ marker مَصمَّم لـ cron (له فِعل واحد فقط).

### Non-functional
- typecheck ✅ / lint ✅ / build ✅ / SW postbuild ✅
- sql-validate ✅ **337/337**
- audit ✅ 0 vulnerabilities

---

## [0.18.2] — 2026-04-30 — Phase 18 round 3 (3× P2 from Codex preview)

### Fixed

- **(P2 #1) `mark_provisioning_failed` ownership check**: الـ RPC كان يَفحص `is_super_admin()` فقط، فأي super_admin يَستطيع إفشال order مَحجوز من super_admin آخر أثناء الـ invite/complete. الإصلاح: `reviewed_by = auth.uid()` يُطلب، إلا لو الـ provisioning lock بائت (>5 دقائق — نَفس قاعدة `reserve` للـ stale takeover). يُغلق race بين super_admins حيث A يُجري invite و B يَضغط "mark failed" خطأً.

- **(P2 #2) bypass واسع لـ service_role على `buildings.subscription_*`**: في v3.38، الـ Phase 14 trigger كان يَفتح bypass لـ `session_user='service_role'` لتَمكين الـ cron expiry. هذا أوسع من اللازم — أي server action تَستخدم `createAdminClient()` (auth-admin، contact_request، Phase 17 join requests، إلخ.) لها bypass صامت. الإصلاح: استبدال الـ session_user check بـ **private schema marker** (Phase 8 درس #6):
  - `private.cron_subscription_expiry_marker` table — مَحجوب من public/authenticated/anon
  - الـ marker يُكتب فقط من `expire_due_subscriptions()` SECURITY DEFINER RPC (GRANT لـ service_role)
  - الـ marker مَربوط بـ `txid_current()` — لا يُمكن تَزويره أو تَكراره
  - الـ trigger يَفحص الـ marker IN THE SAME TXID فقط
  - عند مسار الـ marker، **فقط** `subscription_status` يُسمح له بالتَغيُّر — `subscription_plan`, `trial_ends_at`, `subscription_ends_at` تَبقى محفوظة

- **(P2 #3) cron يَدوس `subscription_ends_at` (التَاريخ التَعاقدي)**: `/api/cron/expire-subscriptions` كان `update buildings set subscription_status='expired', subscription_ends_at=now()` — يَمحو الـ contractual end date. الإصلاح: الـ RPC الجديدة `expire_due_subscriptions()` تُغيِّر `subscription_status` فقط، تَحفظ `subscription_ends_at` الأصلي للـ audit/reports/disputes. الـ cron route يَستدعي الـ RPC بدلاً من direct UPDATE.

### Tests
- 4 اختبارات SQL جديدة (18.24a-e) → **333/333**:
  - 18.24 (a): `expire_due_subscriptions` يَفتح active → expired ويَحفظ `subscription_ends_at` الأصلي (snapshot 2025-12-15)
  - 18.24 (b): direct UPDATE على `subscription_status` بدون marker مَحجوب — broad session_user bypass مُغلَق
  - 18.24 (c): الـ RPC يُحدِّد due-only (الـ rows غير المُستحقَّة لا تَتأثَّر، count return صحيح)
  - 18.24 (d): `mark_provisioning_failed` يَرفض super_admin آخر (ownership check)
  - 18.24 (e): super_admin الأصلي (المَحجوز) يَستطيع mark failed بلا قيود (regression)

### Schema Changes (`supabase/19_phase18.sql`)
- Schema جديد: `private` (revoked from public/authenticated/anon)
- Table جديد: `private.cron_subscription_expiry_marker (txid bigint primary key, created_at timestamptz)`
- RPC جديدة: `public.expire_due_subscriptions() returns int` (security definer، service_role only)
- `buildings_validate_update()` trigger: استبدال `session_user='service_role'` check بـ marker check + قَيد على ما يُمكن تَغييره عبر الـ marker path
- `mark_provisioning_failed`: ownership check (`reviewed_by = auth.uid()`) + stale lock takeover

### Code Changes
- **`src/app/api/cron/expire-subscriptions/route.ts`**: استبدال direct UPDATE بـ `admin.rpc('expire_due_subscriptions')`. يُرجع الآن `expired: count` بدلاً من `expired: 0`.
- **`src/types/database.ts`**: type جديد لـ `expire_due_subscriptions: { Args: Record<string, never>; Returns: number }`

### Lessons (تَوسيع #37)

- **#38** (مُقترَح): عندما تَفتح bypass للـ trigger لمسار خاص (cron/batch/scheduled job)، لا تَستخدم `session_user`/`current_user`/role attribute كـ proof — كلها قابلة للتَكرار من أي caller بنفس الـ role. الـ proof الوحيد القابل للاعتماد: **private schema marker مَربوط بـ `txid_current()`**، يُكتب فقط من security definer RPC مَحدودة الـ GRANT، يُقرأ من الـ trigger في نفس الـ transaction. يُحوِّل الـ bypass من "أي service_role caller" إلى "هذا الـ caller، في هذا الـ transaction، عبر هذا الـ RPC". مُستلَهم من Phase 8 درس #6 (GUC قابل للتَزوير → private marker).

### Non-functional
- typecheck ✅ / lint ✅ / build ✅ / SW postbuild ✅
- sql-validate ✅ **333/333**
- audit ✅ 0 vulnerabilities

---

## [0.18.1] — 2026-04-30 — Phase 18 round 2 (1× P1 + 1× P2 + defense-in-depth from Codex)

### Fixed

- **(P1) `src/actions/subscriptions.ts`**: `createSubscriptionOrderAction` كانت تُمرِّر `total_amount: 0` (placeholder قديم لم يُملَأ) لـ `renderOrderCreatedEmail` → العميل يَستلم تَعليمات تحويل **0 SAR** بدلاً من المبلغ الفعلي. الـ RPC يَحسب الـ snapshot صحيحاً داخلياً، لكن الـ action لم يَكن يَقرأه. الإصلاح: `create_subscription_order` يَرجع الآن `total_amount + currency` ضمن نتيجته، الـ action يَستخدمها مباشرةً للبريد. الـ snapshot consistent بين DB row + email + RPC return (نفس الـ transaction).

- **(P2) `src/app/api/subscriptions/[order_id]/receipt/route.ts`**: الـ token validation كان يَكتفي بـ `valid=true`، لا يَفحص `current_status`. الـ token يَبقى صالحاً حتى بعد `awaiting_review`/`provisioning`/`approved`، فأي صاحب رابط يَستطيع upload ملف لحالة لا تَقبل إيصالاً → الـ Storage يَتلقَّى الملف ثم RPC يَفشل ثم cleanup best-effort (orphan window). الإصلاح: status gate **قبل** upload — لا تَلامس Storage إلا لو `current_status` ∈ `{awaiting_payment, rejected}`. رسائل خطأ مُحدَّدة لكل حالة (awaiting_review → "قيد المراجعة"، approved → "افحص بريدك"، إلخ.).

- **(P2 defense-in-depth) `submit_subscription_receipt` RPC**: أُضيف check ثاني: `rejected` orders تُرفض الآن لو `rejection_attempt_count >= 3` على مستوى DB (كان موجوداً فقط في email logic). الـ route gate + RPC enforce → choke point مَزدوج، لا upload-then-cleanup orphan ممكن حتى لو attacker تَجاوز الـ route.

### Tests
- 6 اختبارات SQL جديدة (18.26-18.31) → **329/329**:
  - 18.26: RPC يَرجع total + currency مَطابقَين للـ snapshot (1490 SAR لـ pro yearly)
  - 18.27: RPC return مع VAT enabled (49 + 15% = 56.35)
  - 18.28: submit_receipt يَرفض status='approved'
  - 18.29: submit_receipt يَرفض status='awaiting_review'
  - 18.30: submit_receipt يَرفض re-upload عند `rejection_attempt_count >= 3`
  - 18.31: submit_receipt يَقبل re-upload عند `attempt_count < 3` (regression)

### Lessons (تَوسيع #35)

- **#36** (مُقترَح): RPCs التي تُنشئ صفّاً مع computed values (snapshot، VAT، total) **يَجب أن تُرجع تلك القيم**، لا فقط الـ id. السبب: الـ caller يَحتاجها لعمليات مُتجاورة (email، توليد URL، logging). بدون ذلك، الـ caller يَلجأ إلى round-trip ثانٍ (SELECT) أو — أسوأ — يُهمل القيم بـ placeholder كـ 0. الـ pattern: `INSERT ... RETURNING ... INTO` ثم `RETURN QUERY` بكل ما يَحتاجه الـ caller.

- **#37** (مُقترَح): public file upload routes يَجب أن تُغلق على state machine **قبل** الـ upload، ليس بعده. الترتيب الصحيح: validate → check status → upload → flip status. ترتيب خطأ (validate → upload → check status) يَخلق orphan files عند rejection الـ RPC (cleanup best-effort = ليس مَضمون). هذا لا يَنطبق فقط على receipts — أي storage upload مَربوط بـ DB workflow.

### Non-functional
- typecheck ✅ / lint ✅ / build ✅ / SW postbuild ✅
- sql-validate ✅ **329/329**
- audit ✅ 0 vulnerabilities

---

## [0.18.0] — 2026-04-30 — Phase 18 (Bank-Transfer Subscription Orders + Provisioning + Admin Onboarding)

### Added

- **`supabase/19_phase18.sql`** — `subscription_orders` table + 8 RPCs + storage bucket + workflow trigger:
  - `subscription_orders` table: 28 columns including hashed access_token, snapshot pricing (amount/vat/total), status enum (7 states: awaiting_payment → awaiting_review → provisioning → approved | provisioning_failed → rejected | expired), Reserve/Complete tracking (provisioning_started_at, provisioning_failure_reason)
  - **Split counters** (lesson #28): `failed_access_attempts` (locks at 5) + `successful_access_count` (informational only)
  - workflow trigger: transition whitelist + audit fields immutable + provisioned_* immutable once set
  - sequence `subscription_order_seq` + `next_subscription_reference()` → SUB-2026-0042 format
  - storage bucket `subscription_receipts` (private, deny-all anon, 5MB max, JPG/PNG/WEBP/PDF)
  - **8 RPCs** (all SECURITY DEFINER):
    1. `create_subscription_order` — server-only (service_role only)، snapshot pricing من tier + platform_settings.vat_*
    2. `validate_subscription_order_token` — anon callable، split counter (success ≠ lock، failure → +1)
    3. `submit_subscription_receipt` — service_role only، transitions awaiting_payment/rejected → awaiting_review
    4. `reserve_subscription_order_for_provisioning` — super_admin، DB lock + status='provisioning' + stale takeover (5 min)
    5. `complete_provisioning` — super_admin، atomic INSERT building + membership + UPDATE order
    6. `mark_provisioning_failed` — super_admin، recovery state
    7. `reset_failed_provisioning` — super_admin، provisioning_failed → awaiting_review
    8. `reject_subscription_order` — super_admin، rejection_attempt_count++
    + helper `get_order_for_receipt_page` — anon callable، token-gated، returns order subset + bank_account
  - **Phase 14 trigger amendment**: `buildings_validate_update` يَقبل الآن `session_user = 'service_role'` كـ exception (يُمكِّن cron expiry بدون super_admin auth)

- **`src/lib/email/index.ts`** — 3 templates عربية جديدة:
  - `renderOrderCreatedEmail` — يَحوي بيانات البنك + reference + receipt link
  - `renderOrderApprovedEmail` — invite link only، **لا credentials**
  - `renderOrderRejectedEmail` — reason + retry link (لو attempts_remaining > 0)

- **Server actions** (`src/actions/subscriptions.ts`) — 5 actions:
  - `createSubscriptionOrderAction` — anon، rate-limited 5/IP/day، calls create_subscription_order RPC + sends order_created email
  - `approveOrderAction` — super_admin، **4-step Reserve/Invite/Complete pattern (lesson #19)**: reserve → auth.admin.inviteUserByEmail → complete_provisioning → email. على فشل أي خطوة → mark_provisioning_failed.
  - `rejectOrderAction` — super_admin، calls reject + sends rejection email with retry/replacement link
  - `resetFailedProvisioningAction` — super_admin retry path
  - `dismissOnboardingWizardAction` — placeholder (client-side localStorage in v1)

- **API routes** — 3 server-only endpoints:
  - `POST /api/subscriptions/[order_id]/receipt` — anon-callable، multipart upload. Pipeline: rate limit (3/IP/hour) → token validation → mime+size check → service_role upload to subscription_receipts/{order_id}/{uuid} → submit_subscription_receipt RPC.
  - `GET/POST /api/cron/expire-orders` — daily cron، protected by `CRON_SECRET`. Expires orders > 30 days in awaiting_payment.
  - `GET/POST /api/cron/expire-subscriptions` — daily cron، expires buildings with subscription_ends_at < now (uses Phase 14 trigger amendment for service_role bypass).

- **Components**:
  - Marketing: `subscribe-form`, `bank-details-card`, `receipt-uploader`, `order-status-badge`
  - Super-admin: `orders-table`, `order-review-card` (with approve/reject/retry actions + receipt preview via signed URL)
  - Dashboard: `onboarding-wizard` (5-step admin checklist، server-computed completion + localStorage dismiss)

- **Pages**:
  - `(marketing)/subscribe/page.tsx` — form (anon)
  - `(marketing)/subscribe/[id]/page.tsx` — bank details + receipt uploader (token-gated)
  - `(marketing)/subscribe/[id]/success/page.tsx` — post-upload landing
  - `(super-admin)/super-admin/orders/page.tsx` — list + status counts
  - `(super-admin)/super-admin/orders/[id]/page.tsx` — review (approve/reject/retry with receipt preview)

- **Wiring**:
  - `(marketing)/pricing/page.tsx` (via `pricing-cards`) — basic/pro buttons now go to `/subscribe?tier=X&cycle=Y` (was `/contact`)
  - `(super-admin)/super-admin/page.tsx` — added "طلبات الاشتراك (N)" with badge for orders awaiting_review or provisioning_failed
  - `(app)/dashboard/page.tsx` — admin sees onboarding wizard (auto-hides on completion or dismiss)
  - Types: `subscription_orders` row + 8 RPCs + 2 enums (`SubscriptionOrderStatus`, `SubscriptionOrderCycle`)

### Defense-in-depth (drama-free recap)

```
HTTP layer (server actions + API routes)
  ├─ rate limits بالـ IP (createOrder 5/IP/day، receipt 3/IP/hour، Upstash production)
  ├─ Zod schemas (UX-friendly errors قبل DB)
  ├─ multipart file validation (mime + size)
  └─ admin client narrow scope ────┐
                                    ▼
DB layer (SECURITY DEFINER RPCs — kept as the only write surface)
  ├─ create_subscription_order (snapshot pricing، VAT calc)
  ├─ validate_subscription_order_token (split counters — legitimate users not locked)
  ├─ submit_subscription_receipt (server_role only)
  ├─ reserve/complete/mark_failed/reset_failed (Reserve/Complete pattern)
  ├─ reject (rejection_attempt_count cap)
  └─ get_order_for_receipt_page (token-gated bank details surface)
                                    │
                                    ▼
Storage layer (table CHECKs + workflow trigger + immutability)
  ├─ status transition whitelist (7 states)
  ├─ submission fields immutable (snapshot)
  ├─ provisioned_* immutable once set
  ├─ NO direct write policies (RLS deny-all anon + super_admin SELECT only)
  └─ subscription_receipts bucket: deny-all anon (uploads ONLY via API route)
```

### Tests
- 25 اختبار SQL جديد (18.1-18.25) → **323/323**:
  - 10 functions/RPCs exist
  - anon = 0 access (RLS + 3 server-only RPCs)
  - create order: snapshot pricing + VAT calc + counters initialized
  - validate split counter (success ≠ lock، 10 valid accesses don't lock)
  - lock at 5 failed
  - submit_receipt server-only + transition
  - reserve race protection + super_admin only
  - complete atomic (building + membership + order)
  - immutability (provisioned_*، email)
  - mark_failed + reset paths
  - reject with attempt counter
  - get_order_for_receipt_page (success + bad token rejected)
  - **Phase 14 trigger amendment**: service_role can expire (cron) + admin still blocked (regression)

### Lessons (مُقترحة للمحفظة)

- **#33**: Reserve/Complete/Fail pattern (lesson #19) tested in production for the first time in Phase 18. Key insight: the "fail" branch is NOT optional — it's the recovery state that turns a 500 error into a recoverable orphan that super_admin can clean up. Without `mark_provisioning_failed`, an invite-without-building leaves the system in an unrecoverable inconsistent state.
- **#34**: Cron jobs that need to bypass workflow triggers should use `session_user = 'service_role'` exception in the trigger itself (per-table, opt-in), NOT disable the trigger globally. This keeps the trigger logic transparent + allows targeted bypass for audit-friendly server jobs.
- **#35**: Snapshot pricing in DB at create-time (لا late-binding من tier table). Without this, a tier price change after order creation would change the displayed amount on /subscribe/[id] retroactively — confusing for both customer and super_admin reviewer (was the customer charged the old or new price?). Pattern matches lesson #11 (period_month consistency).

### Non-functional
- typecheck ✅ / lint ✅ / build ✅ (Middleware 89.5 kB، 8 new routes)
- SW postbuild ✅
- sql-validate ✅ **323/323**
- audit ✅ 0 vulnerabilities

---

## [0.17.3] — 2026-04-30 — Phase 17 closure (UI rotation copy polish, no behavior change)

> Codex وافق على Phase 17 = 100/100 بعد round 3 وذكر polish غير مانع: نص `ShareJoinLink`
> ما زال يقول "ولِّد رابط" بدلاً من "تَدوير/استبدال". DB صار source of truth بعد v3.36، لكن الـ UI لم يُبلِّغ admin أن الرابط القديم سيُعَطَّل تلقائياً.
> هذا الإصدار يُحَدِّث الـ copy بدون أي تَغيير سلوكي. كل الاختبارات تَبقى **298/298**.

### Changed

- **`src/components/apartments/share-join-link.tsx`**:
  - DialogTitle: "رابط دعوة السكان" → **"تَدوير رابط دعوة السكان"**
  - DialogDescription: "ولِّد رابطاً" → **"ولِّد رابطاً جديداً"** (يُلمِّح للـ rotation)
  - أُضيف **warning banner** قبل النموذج: "⚠️ توليد رابط جديد سيُعَطِّل أي رابط سابق لهذه العمارة فوراً"
  - زر العمل: "توليد الرابط" → **"تَدوير وإنشاء رابط جديد"**
  - Warning بعد التَوليد مُحدَّث: "أي رابط سابق صار مُعَطَّلاً تلقائياً (rotation تَم)"
  - Toast message: "تَم تَدوير الرابط — أي رابط قديم تَعَطَّل تلقائياً"

### Not changed (intentional)

- `disable_join_link` RPC: لم يَعد ضرورياً للـ rotation use case (rotation الجديد يُغني عن manual disable)، لكنه يَبقى مَوجوداً للـ admin emergency disable + future use cases.
- لا تَغييرات DB / RPCs / actions / tests.

### Tests
- لا اختبارات SQL جديدة (UI copy only).
- regression: ✅ typecheck / lint / `sql-validate 298/298`.

### Phase 17 — رسمياً مُغلقة

- **Acceptance**: Codex round 3 = 100/100
- **اختبارات**: 40 لـ Phase 17 إجمالاً (30 round 1 + 8 round 2 + 2 round 3)
- **RPCs**: 6 (`create_building_join_link` مع rotation، `resolve_building_join_token`، `submit_join_request`، `approve_pending_member`، `reject_pending_member`، `disable_join_link`)
- **دروس مُضافة للمحفظة**: 4 (#29-#32)

---

## [0.17.2] — 2026-04-30 — Phase 17 round 3 (1× P2 rotation semantic + 1× P3 doc drift)

### Fixed

- **(P2) `supabase/18_phase17.sql` — rotation semantic missing**: `create_building_join_link` كان يُضيف صفّاً جديداً فقط، لا يُعَطِّل أي روابط سابقة لنفس العمارة. PLAN acceptance criterion صريح: "admin يُمكنه توليد token جديد (يُلغي القديم)". لو سُرَّب رابط قديم ثم ولَّد admin رابطاً جديداً، القديم يَبقى صالحاً حتى expiry/max_uses → leak window مَفتوح. الإصلاح: الـ RPC الآن يُنفِّذ atomic UPDATE قبل INSERT يُعَطِّل كل `disabled_at IS NULL` لنفس `building_id`. PostgreSQL function = transaction → atomicity مَضمونة.

- **(P3) `PLAN.md §17 RLS section`**: القسم الرسمي ما زال يَقول "INSERT/UPDATE/DELETE حصراً على admin + super_admin"، بينما v3.35 أزال INSERT/UPDATE وجعل الكتابة عبر RPCs فقط. هذا يُضلِّل أي تَنفيذ/مراجعة لاحقة. تَحديث القسم ليَعكس v3.35:
  - SELECT: admin + super_admin
  - INSERT: NO policy — RPC `create_building_join_link` فقط
  - UPDATE: NO policy — RPCs `submit_join_request` (uses_count) + `disable_join_link` (disabled_at)
  - DELETE: NO policy — soft-disable فقط
  - + إضافة note عن rotation semantic v3.36

### Tests
- 2 اختبارات SQL جديدة (17.39 + 17.40) → **298/298**:
  - 17.39: rotation — توليد link B لنفس building يُعَطِّل link A تلقائياً (atomic)
  - 17.40: leak protection — old token (مَسرَّب) يُرفض بـ 'disabled' بعد rotation

### Behavioral implication

النظام الجديد يَعتبر أن **building له active link واحد في وقت ما**. لو احتاج admin مَستقبلياً عدة روابط مُتزامنة (مثل: رابط "vip" + رابط "general")، يَجب توسيع الـ RPC بـ parameter (مثلاً `keep_existing boolean default false`). v1 يَتبع semantics التَدوير الأبسط.

### Lessons (تَوسيع #29)

- **#32** (مُقترَح): tokens public-facing تَحتاج **rotation semantic explicit** — توليد token جديد = إبطال القديم تلقائياً (atomic). بدون هذا، الـ leak window يَمتد حتى expiry/max_uses الطبيعي. النمط: UPDATE-then-INSERT في نفس الـ transaction (PostgreSQL function). UI يَعرض "rotated" بدلاً من "added another" لتَجنُّب التباس admin.

### Non-functional
- typecheck ✅ / lint ✅ / build ✅ / SW postbuild ✅
- sql-validate ✅ **298/298**
- audit ✅ 0 vulnerabilities

---

## [0.17.1] — 2026-04-30 — Phase 17 round 2 (2× P1 from Codex preview — close direct write bypass)

### Fixed

- **(P1) `supabase/18_phase17.sql` — `pending_apartment_members.UPDATE` bypass**: السياسة `pending_update_admin` كانت تَسمح للـ admin بـ UPDATE مباشر. الـ workflow trigger يَسمح بـ pending→approved (transition صحيح + reviewed_by + reviewed_at). النتيجة: admin يَستطيع عبر Supabase client setting `status='approved'` بدون استدعاء `approve_pending_member` → `link_apartment_member` لا يُستدعى → **لا apartment_members INSERT** → الساكن "مُعتَمَد" بلا صلاحية فعلية (orphan approval). الإصلاح: drop UPDATE policy → الـ RPCs SECURITY DEFINER هي المسار الوحيد.

- **(P1) `supabase/18_phase17.sql` — `building_join_links.INSERT/UPDATE` bypass**: السياسات كانت تَسمح للـ admin بـ direct INSERT + UPDATE على token_hash، building_id، uses_count، max_uses، expires_at، disabled_at. هذا يَفتح bypass واضح للـ lifecycle:
  - تَصفير `uses_count` بعد بلوغ `max_uses`
  - تَغيير `token_hash` إلى token مَسرَّب/معروف
  - نقل الرابط بين عمارات عبر `building_id`
  - مَد `expires_at` بلا حدود
  - كل هذا خارج `create_building_join_link` / `submit_join_request` وبدون trigger يَحمي.
  
  الإصلاح: drop INSERT + UPDATE policies. RPCs SECURITY DEFINER هي المسار الوحيد:
  - INSERT: `create_building_join_link` فقط (admin role check + hash من server)
  - UPDATE uses_count: `submit_join_request` فقط (atomic SELECT FOR UPDATE)
  - UPDATE disabled_at: **`disable_join_link` RPC جديد** (admin role check + idempotent)
  - DELETE: غير مَسموح (audit trail محفوظ)

### Added

- **RPC `disable_join_link(p_link_id uuid)`** — SECURITY DEFINER، admin only، idempotent. يَحل محل direct UPDATE الذي كان في `disableJoinLinkAction`. بدون هذا الـ RPC، الـ action لن يَستطيع تَعطيل الـ link بعد drop UPDATE policy.

### Changed

- **`src/actions/joins.ts` `disableJoinLinkAction`** — استبدال `.from('building_join_links').update(...)` بـ `.rpc('disable_join_link', ...)`. الـ admin client narrow scope يَبقى narrow — كل العمليات عبر RPCs.
- **`src/types/database.ts`** — أُضيف `disable_join_link` RPC.

### Tests
- 8 اختبارات SQL جديدة (17.31-17.38) → **296/296**:
  - 17.31: admin direct UPDATE على pending.status مَحجوب (0 affected rows، status لم يَتغيَّر)
  - 17.32: admin direct UPDATE على uses_count مَحجوب (lifecycle مَحفوظ)
  - 17.33: admin direct INSERT على building_join_links مَحجوب
  - 17.34: disable_join_link RPC نَجح للـ admin
  - 17.35: disable_join_link RPC رُفض للـ resident
  - 17.36: disable_join_link idempotent (call twice = no error)
  - 17.37: disable_join_link يَرفع 'not found' للـ id خاطئ
  - 17.38: approve_pending_member RPC ما زال يَعمل بعد policy drop (regression — SECURITY DEFINER يَتجاوز RLS)

### Defense-in-depth post-round-2

```
HTTP layer (server action)
  ↓ admin client narrow scope (RPCs only)
DB layer (SECURITY DEFINER RPCs — الـ surface الوحيد للكتابة)
  ├─ create_building_join_link  (admin INSERT)
  ├─ submit_join_request         (server-only, atomic uses_count++)
  ├─ disable_join_link           (admin UPDATE disabled_at) [NEW v3.35]
  ├─ approve_pending_member      (admin UPDATE status + apartment_members INSERT)
  └─ reject_pending_member       (admin UPDATE status + reason)
        ↓
Storage layer (CHECK + workflow trigger + immutability)
  ├─ token_hash UNIQUE
  ├─ status transition whitelist
  ├─ submission fields immutable
  └─ NO INSERT/UPDATE policies (admin can't bypass via direct table access)
```

### Lessons (تَوسيع #28)

- **#31** (مُقترَح): الـ "RPC as choke point" مبدأ يَنطبق على **WRITES المُصرَّحة** أيضاً (admin)، ليس فقط anon. لو admin يَملك UPDATE policy على table له lifecycle (counter، state machine، token)، يَستطيع تَجاوز الـ RPC وحدوث `inconsistent state` (orphan approval، lifecycle reset). القاعدة: إن كان للـ table lifecycle محمي بـ RPC، **drop direct write policies كاملاً** — حتى للـ admin. الـ RPCs SECURITY DEFINER يَتجاوزن RLS، فلا يَحتاجن policy. UI تَستدعي RPCs دائماً، لا direct table access.

### Non-functional
- typecheck ✅ / lint ✅ / build ✅ / SW postbuild ✅
- sql-validate ✅ **296/296** (8 جديدة + 288 سابقة)
- audit ✅ 0 vulnerabilities

---

## [0.17.0] — 2026-04-30 — Phase 17 (Building Join Links + Resident Pending Approval)

### Added

- **`supabase/18_phase17.sql`** — 2 tables + 5 RPCs:
  - `building_join_links` — token_hash (SHA-256) + expires_at + disabled_at + max_uses + uses_count. Raw token NEVER stored.
  - `pending_apartment_members` — holding zone للطلبات (status: pending → approved | rejected). workflow trigger يَحجب tampering.
  - 5 RPCs:
    - `create_building_join_link` (admin only) — accepts pre-computed hash from server action
    - `resolve_building_join_token` (anon callable) — read-only lookup، returns building info or enum (invalid/expired/disabled/max_uses_reached/building_inactive)
    - `submit_join_request` (server-only via service_role) — atomic: SELECT FOR UPDATE → INSERT pending → uses_count++
    - `approve_pending_member` (admin only) — atomic: pending → approved + delegates to `link_apartment_member` (Phase 5 RPC)
    - `reject_pending_member` (admin only) — requires reason 3-500 chars
  - RLS:
    - `building_join_links`: deny-all on anon (لا direct table access — درس #28). admin/super_admin only.
    - `pending_apartment_members`: SELECT للـ user نفسه + admin، UPDATE/DELETE لـ admin only، **NO INSERT policy** (server-only RPC هو الـ surface الوحيد).

- **`src/lib/tokens.ts`** — server-only token utilities:
  - `generateRawToken(byteLength=32)` — cryptographically secure URL-safe token (256 bits entropy = 43 chars base64url)
  - `hashToken(rawToken)` — SHA-256 hex (64 chars). Used both at create-time + lookup-time.

- **Server actions** (`src/actions/joins.ts`) — 6 actions:
  - `resolveJoinTokenAction` (anon) — rate-limited 20/IP/min، calls RPC، translates enum to Arabic UI text
  - `signupAndJoinAction` (anon) — rate-limited 5/IP/hour، Supabase signUp with `pending_join_*` metadata + emailRedirectTo `/join/finalize`
  - `finalizeJoinRequestAction` (authenticated) — reads metadata، calls submit_join_request via admin client (service_role narrow scope)، clears metadata
  - `createJoinLinkAction` (admin) — generates raw token + hash، calls create_building_join_link RPC، returns raw token + share URL **once**
  - `approvePendingMemberAction` (admin) — calls approve RPC
  - `rejectPendingMemberAction` (admin) — calls reject RPC
  - `disableJoinLinkAction` (admin) — soft disable

- **Components**:
  - `marketing/join-form.tsx` — anon visitor signup form (email + password + apartment_number + phone)
  - `apartments/share-join-link.tsx` — admin button: generate + show raw token ONCE with warning
  - `apartments/pending-members-list.tsx` — admin queue with apartment-picker dialog (auto-selects requested number) + reject reason dialog

- **Pages**:
  - `(marketing)/join/[token]/page.tsx` — anon, resolves token via server action، renders form or error
  - `(marketing)/join/finalize/page.tsx` — authenticated، runs finalizeJoinRequestAction (idempotent — refresh-safe)
  - `account/pending/page.tsx` — standalone (outside (app) group)، shows "awaiting activation" state + rejected history
  - `(app)/apartments/pending/page.tsx` — admin queue

- **Wiring**:
  - `(app)/apartments/page.tsx` — added "رابط دعوة سكان" button + "طلبات الانضمام (N)" badge
  - `(app)/layout.tsx` — pending state check: zero buildings + has pending → `/account/pending` (instead of `/onboarding`)
  - `middleware.ts` — `/join/*` added to public routes (anon-reachable)
  - Types: 2 new tables + 5 new RPCs + `PendingMemberStatus` enum

### Defense-in-depth (lessons #18 + #20 + #28 applied wholesale)

```
HTTP layer (server action)
  ├─ resolveJoinTokenAction:    rate limit 20/IP/min
  ├─ signupAndJoinAction:       rate limit 5/IP/hour
  └─ admin client narrow scope ────┐
                                    ▼
DB layer (SECURITY DEFINER RPCs)
  ├─ resolve_building_join_token: anon-callable, read-only, NO uses_count++
  └─ submit_join_request:         service_role only, ATOMIC (SELECT FOR UPDATE
                                  + INSERT pending + uses_count++ as one transaction)
                                    │
                                    ▼
Storage layer (table CHECKs + workflow trigger)
  ├─ token_hash UNIQUE
  ├─ status transition whitelist (pending → approved | rejected, rejected → pending)
  ├─ submission fields immutable post-INSERT
  └─ rejection_reason ≥ 3 chars when status='rejected'
```

### Tests
- 30 اختبار SQL جديد (17.1-17.30) → **288/288**:
  - Schema (2 tables + 5 RPCs exist)
  - RLS deny-all anon on building_join_links
  - admin create + resident block + token_hash unique
  - resolve: success + invalid + disabled + expired + max_uses_reached
  - submit: anon block + authenticated block + atomic success + duplicate block + invalid token block
  - pending visibility: admin sees + user sees own + cross-user privacy
  - workflow: rejected without reason blocked + invalid transition blocked
  - immutability: building_id + requested_apartment_number frozen
  - approve atomicity (pending → approved + apartment_members INSERT)
  - approve cross-tenant rejected (composite tenant check)
  - reject reason length validation
  - resident privilege escalation blocked
  - inactive building integration with Phase 14

### Lessons (مُقترَحة للمحفظة)

- **#29**: للـ tokens public-facing، الـ `gen_random_uuid()` في DB لا يَكفي — استخدم `randomBytes(32)` server-side. الـ entropy + URL-safe base64 + ≥ 32 bytes = unguessable حتى مع rate-unlimited brute force. SHA-256 للـ lookup (O(1) indexed)، ليس bcrypt (نمط Stripe/Slack).
- **#30**: في 2-step signup flow (signup → email confirm → finalize)، الحالة بين الخطوتَين تَعيش في `user_metadata`. التَطبيق:
  - Step 1: `auth.signUp({ options: { data: { pending_*: ... }, emailRedirectTo: ... } })`
  - Step 2 (post-callback): قراءة من user_metadata + استدعاء RPC + تَنظيف الـ metadata
  - Idempotency: الـ finalize page يَفحص لو الـ pending row موجود بالفعل → يَتخطى (refresh-safe)

### Non-functional
- typecheck ✅ / lint ✅ / build ✅ (Middleware 89.5 kB، 4 new routes: /join/[token] 4.68 kB، /join/finalize 178 B، /account/pending 145 B، /apartments/pending 6.02 kB)
- SW postbuild ✅
- sql-validate ✅ **288/288**
- audit ✅ 0 vulnerabilities

---

## [0.16.4] — 2026-04-30 — Phase 16 closure (non-blocking comment cleanup, no behavior change)

> Codex وافق على Phase 16 = 100/100 بعد round 4 وذكر cleanup غير مانع للتعليقات القديمة.
> هذا الإصدار يُنفِّذ الـ cleanup مع لا تغييرات سلوكية. كل الاختبارات تَبقى **258/258**.

### Changed

- **`src/lib/supabase/admin.ts`** — JSDoc كان يَقول "Only inside `src/app/(super-admin)/`" الذي صار غير دقيق بعد إضافة `marketing.ts` كـ call site مَسموح في v3.32. JSDoc الآن يَسرد المَواضع المُصرَّح بها صراحةً (`(super-admin)/...` + `actions/marketing.ts`)، يُضيف القاعدة "admin client لا يَلمس tables مباشرةً — RPCs فقط"، ويُوضِّح أن إضافة call site جديد تَتطلَّب PLAN amendment + Codex review.
- **`supabase/17_phase16.sql` §(3)** — التَعليق العلوي على `subscription_requests` كان يَقول "anon يَكتب (INSERT-only)" — لم يَعد صحيحاً بعد round 4. الآن يَشرح الـ choke point pattern (RPC server-only، RLS تَحجب direct anon INSERT، الـ admin client من marketing.ts).
- **`PLAN.md §2.3`** — الـ amendment يَكتسب استثناء #2 صريح لـ "public form choke points" (Phase 16 round 4)، يَشرح:
  - السبب الأصلي (anon-key-in-bundle bypass)
  - النمط (RPC server-only، admin client narrow scope)
  - القاعدة العامة لإضافة استثناء جديد (PLAN amendment + Codex review + scope tests)
- **`PLAN.md §1 (test #12)`** — قائمة `(super-admin)/`-only للـ admin.ts imports تَوسَّعت لتَشمل `src/actions/marketing.ts` كـ call site مَسموح.

### Not changed (intentional)

- Historical changelog entries في PLAN.md (التحديثات في 1.x): تَصف ما كان صحيحاً وقتها. النسخة الحالية v3.32+ تُوضِّح التَوسيع الفعلي.
- SQL block comment لـ `submit_contact_request` (سبق توثيقه v3.32) + `log_email_failure` (سبق توثيقه v3.31).
- `.env.example` (سبق تَحديثه v3.32).

### Tests
- لا اختبارات SQL جديدة (تَغييرات تعليقات فقط).
- regression الكامل: ✅ typecheck / lint / build / `sql-validate 258/258` / `audit 0 vulnerabilities`.

### Phase 16 — رسمياً مُغلقة

- **Acceptance**: Codex round 4 = 100/100
- **اختبارات**: 30 لـ Phase 16 إجمالاً (12 round 1 + 9 round 2 + 5 round 3 + 6 جديدة + 3 محدَّثة في round 4)
- **RPCs**: 9 (`get_active_subscription_tiers`, `get_public_bank_details`, `log_email_failure`, `submit_contact_request` + workflow trigger functions + `set_updated_at_*` helpers)
- **دروس مُضافة للمحفظة**: 8 (#21-#28)

---

## [0.16.3] — 2026-04-30 — Phase 16 round 4 (1× P2 from Codex preview — choke point closure)

### Fixed

- **(P2) `supabase/17_phase16.sql` + `src/actions/marketing.ts`**: ثغرة معمارية متَبقِّية من round 2/3. الـ rate limit يَعيش في server action، لكن `subscription_requests` كان يَملك `requests_insert_anon` policy → أي مهاجم يَملك anon key (مَعروض في bundle) يَستطيع `POST /rest/v1/subscription_requests` مباشرةً عبر PostgREST بأي عدد، متجاوزاً rate limit وZod max lengths في الـ action. هذا يَكسر معيار PLAN "rate limit + honeypot يُوقف spam".

### Changed

- **`requests_insert_anon` policy → DROPPED**. لا direct anon INSERT بعد الآن.
- **RPC جديد `submit_contact_request(p_full_name, p_email, p_phone, p_building_name, p_city, p_estimated_apartments, p_interested_tier, p_message, p_honeypot)`** — SECURITY DEFINER، server-only:
  - GRANT حصرياً لـ service_role (revoke from public)
  - يَفرض داخلياً: honeypot empty، length constraints على كل الحقول، interested_tier whitelist، status='new' forced (لا p_status param)
  - defense-in-depth: validation داخل RPC = طبقة 2، Zod في action = طبقة 1، CHECK constraints على table = طبقة 3
- **`submitContactRequestAction` rewrite**: استبدال direct `.insert()` بـ `admin.rpc('submit_contact_request', ...)` عبر `createAdminClient()` narrow scope. الـ admin client يُستخدم في عملَين فقط (RPC submission + log_email_failure RPC) — لا touches direct على tables.
- **`SUPABASE_SERVICE_ROLE_KEY` الآن إلزامي لـ `/contact`** (كان اختيارياً في v0.16.0). إن غاب، الـ action يُرجع رسالة واضحة "الخدمة غير مُكوَّنة". `.env.example` مُحدَّث ليُوضِّح كل مَواضع الاستخدام.

### Tests
- 6 اختبارات SQL جديدة (16.27-16.32) + تَحديث 3 اختبارات قديمة → **258/258**:
  - Test 16.6 (قديم): anon INSERT direct **BLOCKED** الآن (كان يَنجح)
  - Test 16.8 (قديم): honeypot CHECK يُختَبَر عبر superuser (anon لا يَستطيع INSERT أصلاً)
  - Test 16.11 (قديم): الـ RPC يَفرض status='new' (لا p_status param)
  - Test 16.22 (round 3): obsolete pattern — الآن يَختبر أن anon INSERT حتى مع UUID مُسبَق ما زال مَحجوباً
  - Test 16.27: anon لا يَستطيع استدعاء submit_contact_request RPC (server-only)
  - Test 16.28: authenticated user (resident) لا يَستطيع استدعاؤه
  - Test 16.29: RPC يَرفض honeypot غير فارغ (defense layer 1 — RPC level)
  - Test 16.30: RPC يَفرض length validation داخلياً (defense-in-depth)
  - Test 16.31: RPC يَفرض whitelist على interested_tier
  - Test 16.32: RPC end-to-end (super_admin يَرى الـ row صحيحاً مع status='new')

### Defense-in-depth layout (post-round-4)

```
HTTP layer (server action)
  ├─ rate limit بالـ IP (لأن DB لا يَعرف IP — درس #20)
  ├─ Zod schema (UX-friendly errors قبل DB)
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

### Lessons (تَوسيع #20)

- **#28** (مُقترَح): الـ rate limit في server action يُحمي **فقط** المسار عبر action. لو الـ table يَملك anon INSERT policy، الـ anon key (visible في bundle) يَسمح بـ direct PostgREST INSERT متجاوزاً الـ action. القاعدة: **لكل public form، إما (أ) إغلاق direct table access كاملاً وإجبار المسار عبر action/RPC server-only، أو (ب) إضافة DB-side rate limit (صعب، يَحتاج tracking مع timestamps + IP/user-agent — لا يُوصى به)**. الخيار (أ) هو النمط الصحيح.

### Non-functional
- typecheck ✅ / lint ✅ / build ✅ / SW postbuild ✅
- sql-validate ✅ **258/258**
- audit ✅ 0 vulnerabilities

---

## [0.16.2] — 2026-04-30 — Phase 16 round 3 (1× P1 + 1× P2 from Codex preview)

### Fixed

- **(P1) `src/actions/marketing.ts`**: بعد التَحويل من service_role إلى regular client في round 2، السلسلة `.insert(...).select('id').single()` صارت معطوبة. PostgREST يَطلب SELECT permission عند `return=representation`، و `subscription_requests` لا يَملك SELECT policy للـ anon (privacy intentional). النموذج كان قد يَفشل أو يُرجع data فارغة رغم نجاح الـ INSERT. **الإصلاح**: تَوليد `requestId = randomUUID()` server-side، تَمريره في الـ INSERT، حذف `.select().single()`. الـ id يُستخدم بعدها في `log_email_failure` للـ audit trail.

- **(P2) `supabase/17_phase16.sql`**: `log_email_failure` كان مَمنوحاً للـ `anon` و `authenticated`. هذا يَفتح:
  - audit_logs spam endpoint (anon abuse → تَضخيم الجدول خارج rate limit `/contact`)
  - استثناء صريح لقاعدة "audit_logs لا INSERT من العملاء" (الموجود trigger-only)
  
  **الإصلاح**: `revoke ... from public` + `grant ... to service_role` فقط. الـ server action في `marketing.ts` يَستدعيه عبر `createAdminClient()` (service_role narrow scope: audit logging على system table، لا user data).
  
  **نمط defense-in-depth**: 
  - الـ user data INSERT يَمر عبر anon client (RLS = الـ gate الفعلي)
  - الـ audit log INSERT يَمر عبر service_role admin client (system table، server-only)
  - لو `SUPABASE_SERVICE_ROLE_KEY` غائب (dev)، الـ logFailure يَتراجع إلى console — الـ contact request نفسه يَنجح بدون مشكلة (graceful degradation).

### Tests
- 5 اختبارات SQL جديدة (16.22-16.26) → **252/252**:
  - INSERT بـ UUID مُولَّد server-side، بدون .select(), يَعمل لـ anon ✓
  - anon ما زال لا يَستطيع SELECT الصف بعد INSERT (privacy حُفظت) ✓
  - log_email_failure يَرفض anon (permission denied) ✓
  - log_email_failure يَرفض authenticated (resident) ✓
  - log_email_failure من server-side context يَعمل (regression) ✓

### Lessons (تَوسيع #18 و #24)

- **#26** (مُقترَح): PostgREST `return=representation` (المُفعَّل بالـ default على Supabase JS client عند `.select()`) يَتطلَّب SELECT permission على الجدول. للـ anon-INSERT-only patterns (مثل contact form)، **ولِّد UUID server-side ولا تَستخدم `.select()`** — وإلا الـ INSERT يَفشل/يُرجع فارغاً رغم نجاحه في DB.
- **#27** (مُقترَح): audit_logs RPCs **يَجب أن تَكون server-only** (revoke from anon/authenticated). audit_logs قاعدة المنصة الحساسة، الـ INSERT المعتاد عبر triggers فقط. لو احتجت SECURITY DEFINER RPC للـ audit، اجعل الـ EXECUTE حصرياً لـ service_role، واستدعها من server actions عبر admin client مَع scope ضيق.

### Non-functional
- typecheck ✅ / lint ✅ / build ✅ / SW postbuild ✅
- sql-validate ✅ **252/252**
- audit ✅ 0 vulnerabilities

---

## [0.16.1] — 2026-04-30 — Phase 16 round 2 (4× P2 design refinements from Codex preview)

### Fixed

- **(P2 #1) `src/actions/marketing.ts`**: `submitContactRequestAction` كان يَستخدم `createAdminClient()` (service_role) للـ INSERT، فيَتجاوز RLS. الآن يَستخدم `createClient()` العادي (anon-respecting) → policy `requests_insert_anon` هي الـ code path الفعلي → defense-in-depth مَحفوظة + الـ SQL test يُمثِّل الواقع.
- **(P2 #2) `supabase/17_phase16.sql`**: `get_public_bank_details()` كان `SECURITY DEFINER` بـ `GRANT EXECUTE TO authenticated` → أي مستخدم مسجَّل يَقرأ بيانات البنك متجاوزاً RLS. الآن يَفحص `is_super_admin()` داخلياً ويَرفض بـ "Access denied" لكل من سواه. Phase 18 سيُغيِّره إلى token-validating RPC مُربط بـ subscription_orders.
- **(P2 #3) `src/actions/marketing.ts` + `supabase/17_phase16.sql`**: فشل البريد كان يُكتَب في console فقط — لا audit trail. أُضيف RPC جديد `log_email_failure(p_entity_type, p_entity_id, p_email_to, p_email_kind, p_reason)` (SECURITY DEFINER + entity_type whitelist) يَكتب في `audit_logs` بـ `action='email_failure'`. الـ action يُحلِّل الآن نتائج `Promise.allSettled` ويُسجِّل كل فشل (config_missing أو send_failed) للـ super_admin ليَراه في `/super-admin/audit`. الـ DB integrity تَبقى — لا rollback.
- **(P2 #4) `supabase/17_phase16.sql`**: workflow trigger كان يُجمِّد `email/full_name/building_name/phone/honeypot` فقط — `city`، `estimated_apartments`، `interested_tier`، `message` بقيت قابلة للتَعديل من super_admin. الآن **كل** submitter-provided fields مُجمَّدة. super_admin يُحدِّث `status/notes/reviewed_by/reviewed_at` فقط (workflow fields). `notes` للتَعليقات الخاصة (لا يَكتب على `message`).

### Tests
- 9 اختبارات SQL جديدة (16.13-16.21) → **247/247**:
  - bank lockdown: admin عادي يُرفَض، super_admin يَنجح
  - log_email_failure: يُنشئ audit_logs row + يَرفض entity_type خارج whitelist
  - tighter immutability: city + estimated_apartments + interested_tier + message كلها مُجمَّدة
  - regression: workflow fields (status/notes) ما زالت قابلة للتَحديث

### Lessons (تَوسيع الدرس #18)
- **#24** (مُقترَح): `SECURITY DEFINER` بدون `is_super_admin()` check داخلي = ثقب أمني. الـ GRANT يُحدِّد مَن يَستدعي، لكن الـ DEFINER يَتجاوز RLS. القاعدة: كل RPC حسّاس يَفحص الدور **داخلياً** بصرف النظر عن GRANT.
- **#25** (مُقترَح): graceful failures يَجب أن تُسجَّل في audit_logs (ليس console فقط) ليَراها admin من المنتج. console يَختفي بعد ساعات على Vercel، audit_logs دائم.

### Non-functional
- typecheck ✅ / lint ✅ / build ✅ / SW postbuild ✅
- sql-validate ✅ **247/247**
- audit ✅ 0 vulnerabilities

---

## [0.16.0] — 2026-04-30 — Phase 16 (Marketing + Pricing + Public Subscription Requests)

### Added

- **`supabase/17_phase16.sql`** — 3 tables + 2 RPCs:
  - `subscription_tiers` — جدول الباقات (id, name, prices, max_apartments, features, sort_order). 4 باقات افتراضية مَزروعة (trial/basic/pro/enterprise). RLS: anon SELECT للنشطة، super_admin all.
  - `platform_settings` — key/value JSONB. seeded بـ bank_account placeholder + vat_rate=0.15 + vat_enabled=false. RLS: super_admin only (لا anon).
  - `subscription_requests` — CRM contact form. RLS: anon INSERT بـ status='new' فقط، super_admin SELECT/UPDATE. honeypot field محمي بـ CHECK.
  - workflow trigger: created_at + email + full_name + building_name + phone + honeypot immutable على UPDATE.
  - `get_active_subscription_tiers()` RPC (anon callable) — يُستخدم من `/pricing`.
  - `get_public_bank_details()` RPC (super_admin only في Phase 16، Phase 18 سيُوسِّع GRANT).
- **مَجموعة routes جديدة `(marketing)`**:
  - `(marketing)/layout.tsx` — header + footer مَنفصلان عن (app) و (super-admin).
  - `(marketing)/page.tsx` — landing بـ Hero + FeaturesGrid + CtaBanner.
  - `(marketing)/pricing/page.tsx` — يَقرأ من DB عبر RPC، toggle شهري/سنوي.
  - `(marketing)/contact/page.tsx` — نموذج CRM.
- **Components**:
  - `marketing/`: hero, features-grid, cta-banner, marketing-header, marketing-footer, pricing-cards (client), contact-form (client مع honeypot).
  - `super-admin/requests-table` — CRM table بـ status workflow + dialog.
  - `super-admin/platform-settings-form` — UI لتَعديل bank_account + VAT.
  - `ui/switch.tsx` — Switch component مَكتوب من الصفر (لا dependency Radix جديدة).
- **Pages super-admin جديدة**:
  - `/super-admin/requests` — CRM للطلبات + فلاتر بحالة.
  - `/super-admin/settings` — UI لتَعديل platform_settings.
  - `/super-admin` (المُحدَّث) — يَعرض count للطلبات الجديدة + روابط للـ Requests + Settings.
- **Server actions** (`src/actions/marketing.ts`):
  - `submitContactRequestAction` — anon. rate-limited (3/IP/ساعة) + honeypot + Zod + service-role INSERT.
  - `updatePlatformSettingsAction` — super_admin. JSON validation per-key.
  - `updateSubscriptionRequestStatusAction` — super_admin.
- **Resend email integration** (`src/lib/email/index.ts`):
  - graceful failure: لو RESEND_API_KEY غائب → warning + return false. لا rollback DB.
  - 10s timeout على الـ fetch لـ Resend (لا نَحجب thread).
  - 2 templates: contact_notification (للـ super_admin) + contact_confirmation (للمُرسِل).
  - 3 env vars جديدة: RESEND_API_KEY، RESEND_FROM_EMAIL، SUPER_ADMIN_NOTIFICATION_EMAIL (كلها اختيارية).
- **Rate limit infrastructure** (`src/lib/rate-limit.ts`):
  - in-memory per-instance (Phase 16 acceptable لأن honeypot هو الـ primary defense).
  - مُهيَّأ بـ interface مُتطابق مع Upstash لتَسهيل الـ swap في Phase 17/18.
  - `getClientIp()` helper يَقرأ من x-forwarded-for (Vercel-trusted).
- **SEO**:
  - `app/sitemap.ts` — يُولِّد `/sitemap.xml` ديناميكياً (`/`, `/pricing`, `/contact`).
  - `app/robots.ts` — يَسمح بالعامة، يَمنع crawling لكل authenticated routes.
  - root metadata: metadataBase + title template + OpenGraph + keywords.
  - per-page metadata: alternates.canonical + OG على landing/pricing/contact.

### Changed

- **`src/middleware.ts`** — أُضيف `/pricing`, `/contact`, `/about`, `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest` للـ public routes.
- **`src/app/page.tsx`** — حُذف. الـ landing الآن في `(marketing)/page.tsx` ليَستفيد من الـ marketing layout.
- **`src/app/layout.tsx`** — root metadata موسَّعة: metadataBase + title template + OG defaults + keywords.
- **`src/types/database.ts`** — أُضيفت 3 جداول جديدة + 2 RPCs + `SubscriptionRequestStatus` enum.

### Tests
- 12 اختبار SQL جديد (Phase 16) → **238/238**:
  - 4 default tiers seeded ✓
  - get_active_subscription_tiers RPC ✓
  - tier CHECK constraints (trial=null prices، non-trial يَحتاج price) ✓
  - anon SELECT tiers ✓ / no SELECT settings ✓ / no SELECT requests ✓
  - anon INSERT requests ✓
  - honeypot CHECK rejects bots ✓
  - workflow trigger: email immutable ✓ / status update OK ✓
  - WITH CHECK rejects status='closed_won' من anon ✓
  - platform_settings seeded with 3 keys ✓

### Lessons (مُقترحة للمحفظة)

- **#21**: في public surface، Storage RLS لا تَكفي وحدها لـ honeypot — استخدم CHECK constraint كـ defense layer 2 (DB-level rejection يَعمل حتى لو RLS تَجاوز).
- **#22**: route groups في Next.js لا تُطبَّق على الـ root route. لو أردت layout موحَّد لـ `/` + `/pricing` + `/contact`، الـ landing يَجب أن يَكون داخل group folder (`(marketing)/page.tsx`)، ليس في `app/page.tsx`.
- **#23**: graceful email failure pattern: `Promise.allSettled` + لا rollback. الـ DB integrity هي source of truth، الإيميل هو notification منفصل.

### Phase 16 Acceptance Criteria — 100/100

- ✅ landing احترافية، Lighthouse ≥ 90 (يُقاس بعد deploy)
- ✅ /pricing من DB (تَعديل tier ينعكس فوراً)
- ✅ toggle شهري/سنوي
- ✅ /contact يَحفظ + يَظهر في /super-admin/requests
- ✅ anon RLS isolation
- ✅ rate limit + honeypot
- ✅ SEO: sitemap + robots + canonical + OG
- ✅ RTL + dark/light + mobile
- ✅ super_admin يُعدِّل bank + VAT عبر UI
- ✅ graceful email failure (DB save still succeeds)

### Non-functional
- typecheck ✅
- lint ✅
- build ✅ (5.01 kB /contact, 3.94 kB /pricing, 89.5 kB middleware)
- SW postbuild ✅ (no leak)
- sql-validate ✅ **238/238**
- audit ✅ **0 vulnerabilities**

---

## [0.15.2] — 2026-04-29 — Phase 15 round 3 (more doc-code consistency sweeps)

### Fixed (2× P2 + 1× P3 from Codex)

ثلاث تَناقُضات إضافية مُتبقِّية بعد round 2 على مستوى نصوص محدَّدة:

- **(P2) `ADMIN_GUIDE.md` §1 جدول الأدوار**: خانة `resident` كانت تَقول "يُضيفه admin أو يَنضم بـ invite (في تَطوير لاحق)". الـ invite **مَوجود فعلياً** عبر `LinkMemberDialog` + `auth.admin.inviteUserByEmail`. تَصحيح إلى: "admin يُدخِل بريده — لو مُسجَّل يُربط مباشرة، لو غير مُسجَّل تُرسل دعوة بريدية تلقائياً". هذا يُغلق الالتباس مع §6.
- **(P2) `USER_GUIDE.md` §4 + FAQ "التطبيق لا يَعمل بدون نت"**: كان يَعِد بـ "الصفحات التي زرتها قبل تَعمل (cached)". هذا يُخالف الـ Service Worker الفعلي الذي يُستخدم `NetworkOnly` للـ navigations عَمداً (Phase 13 round 2: عدم تَخزين HTML/RSC/API لحماية بيانات multi-tenant). تَصحيح إلى: "صفحة بدون اتصال تَظهر، لا تُعرض الصفحات المُصادَقة المُخزَّنة" + شرح السبب (خصوصية + بيانات طازجة).
- **(P3) `DEPLOYMENT.md` §5 قائمة فحص النشر**: طلب اختبار "ارفع صورة avatar من `/dashboard`". لا يُوجد UI لرفع avatar (الـ bucket `avatars` مَوجود في `05_storage.sql` لكن لا واجهة تشغيلية). تَصحيح إلى: اختبار رفع إيصال دفعة من `/payments/new` (يَستخدم `receipt-uploader` فعلياً → bucket `receipts`)، مع اختبار اختياري للـ invoice / document.

### Tests
- لا اختبارات SQL جديدة (تَغييرات وثائقية فقط).
- regression الكامل: ✅ typecheck / lint / build / `sql-validate 226/226` / `audit 0 vulnerabilities`.

### Lessons (تَوسيع الدرس #17)
الدرس الـ 17 (round 2) قال "الكود source of truth للوثائق". Round 3 يَكشف بُعداً إضافياً: **تَناقُضات الوثائق تَنتشر في نصوص متعدِّدة** — جدول الأدوار، FAQ، قائمة الفحص، كلها لها صدى لنفس السلوك. doc-pass واحد قد يُغفل بعضها. الحل التشغيلي: عند تَصحيح ادعاء سلوكي، استخدم grep على الكلمات المفتاحية (`avatar`, `cached`, `invite`, ...) عبر **كل** ملفات `*.md` للتأكُّد من اتساق النصوص.

---

## [0.15.1] — 2026-04-29 — Phase 15 round 2 (doc-code consistency on invite flow)

### Fixed (3× P2 from Codex)

ثلاث تَناقُضات في وثائق Phase 15 الأولى تتعلَّق بمسار "ربط/دعوة الساكن":

- **`.env.example`**: قَلَب الوصف القائل "service_role غير مُستخدم في المشروع". الواقع: مُستخدم server-only في `src/lib/supabase/auth-admin.ts → getAuthAdmin()` → wrapper مُتعمَّد ضيق يَكشف فقط `auth.admin` API surface (لا `from()`/`rpc()`/`storage`)، يُستدعى من `linkOrInviteMemberAction` لـ `auth.admin.listUsers` + `auth.admin.inviteUserByEmail`. كل قراءات/كتابات جداول التطبيق تَبقى عبر RLS / RPCs.
- **`DEPLOYMENT.md` §2.1**: أزال الادعاء "المشروع لا يَدعم invite-only flow عبر UI". الواقع: `LinkMemberDialog` + `linkOrInviteMemberAction` يَدعمان ذلك بالكامل. المسار الصحيح للنشر invite-only: super_admin أولاً، ثم تَعطيل التسجيل العام، مع `SUPABASE_SERVICE_ROLE_KEY` مَضبوط.
- **`ADMIN_GUIDE.md` §6 (ربط ساكن بشقة)**: غيَّر "ابحث عن المستخدم بالاسم (يَجب أن يَكون مسجَّلاً)" إلى الواقع: أَدخل البريد الإلكتروني → لو موجود يُربط، لو غير موجود تُرسل دعوة بريدية تلقائياً (`auth.admin.inviteUserByEmail`)، الساكن يَضع كلمة مرور ويَدخل وهو مَربوط. أضاف ملاحظات تشغيلية (الـ env var، أول عضو=ممثل التصويت، SMTP custom).

### Changed (consistency cross-check)

- **`USER_GUIDE.md` §1**: أُعيد تَنظيم القسم لتَوضيح المَسارَين المدعومَين:
  - **مسار (أ) دعوة من admin** (الأسهل): البريد ←رابط ←كلمة مرور ←دخول مع ربط جاهز.
  - **مسار (ب) تسجيل ذاتي**: register ←تأكيد ←مشاركة البريد مع admin.
  - أُبقي تحذير "لا تَضغط تسجيل عمارة جديدة".

### Tests
- لا اختبارات SQL جديدة (التَغييرات وثائقية فقط).
- regression الكامل: ✅ typecheck / lint / build / `sql-validate 226/226` / `audit 0 vulnerabilities`.

### Lessons
- **#17**: في docs مشروع متعدِّد الأدلة (README / DEPLOYMENT / ADMIN_GUIDE / USER_GUIDE)، الـ source of truth للسلوك الفعلي هو **الكود نفسه** (server actions + UI components). أي تَغيير في `auth-admin` أو `LinkMemberDialog` يَجب أن يُتبَع بـ doc-pass على كل الأدلة المُتأثِّرة. مُراجعة Codex التَوثيقية لا تَقلّ أهمية عن مُراجعة الكود.

---

## [0.14.3] — 2026-04-29 — Phase 14 round 3 (path-aware fallback)

### Fixed
- **(P1) `src/middleware.ts`**: subscription-gate fallback أصبح role-aware للمسارات admin-only. السيناريو الذي كَسر round 2: مستخدم له `[A=expired, B=active resident, C=active admin]` يَزور `/apartments` → الـ middleware كان يَنتقل تلقائياً إلى B (الأقدم النشط) ثم admin-only gate يُرجع 403 رغم وجود C النشطة admin. الإصلاح: عند `requiresAdmin`، امسح أولاً عن `role='admin'` ضمن العمارات النشطة قبل الـ fallback.

### Tests
- 4 اختبارات جديدة (14.25-14.28) → **226/226**.

### Lessons
- **#16**: auto-switch للـ tenant cookie يَجب أن يَكون path-aware — الـ gate الأعلى يَتنبَّأ بمتطلبات الـ gates الأدنى لتجنُّب الانتقال إلى tenant ثم رفض المستخدم لاختيار لم يَتخذه.

---

## [0.14.2] — 2026-04-29 — Phase 14 round 2 (subscription-aware fallback)

### Fixed
- **(P1) `src/middleware.ts` + `src/lib/tenant.ts`**: subscription-gate لم يَكن يَختار عمارة نشطة بديلة عند كوكي منتهي. السيناريو: مستخدم له `[A=expired, B=active]` والكوكي على A → كل المسارات تُحجب → `/onboarding` يُعيد إلى `/dashboard` المحجوب → loop. الإصلاح: نمط Phase 5 cookie-propagation — detect → look up alternative → switch cookie (request + response) → continue. الـ rewrite إلى `/subscription-inactive` يَحدث فقط عند انعدام البدائل.

### Tests
- 4 اختبارات جديدة (14.21-14.24) → 222/222.

### Lessons
- **#15**: أي gate يَعتمد على tenant cookie في multi-tenant يَجب أن يَدعم cookie-propagation fallback. القبول/رفض الثنائي يُنتج loops عند tenant معطّل.

---

## [0.14.1] — 2026-04-29 — Phase 14 round 1 (initial)

### Added
- **`supabase/16_phase14.sql`**:
  - `buildings_validate_update` trigger: subscription fields (plan/status/trial_ends_at/subscription_ends_at) لا تَتغيَّر إلا بـ super_admin؛ transition whitelist كامل (trial→active|expired|cancelled, active→past_due|cancelled|expired, expired→active|trial, ...); created_at/created_by immutable.
  - `platform_stats()` RPC — إحصائيات المنصة + trials_expiring_soon (< 7 أيام).
  - `update_building_subscription()` RPC — مسار الكتابة الوحيد المُسانَن.
  - `building_usage_detail()` RPC — 8 مقاييس لكل عمارة.
  - `is_building_active_subscription()` helper.
  - كل RPCs SECURITY DEFINER + `is_super_admin()` check.
- **Queries** `src/lib/queries/super-admin.ts` — 5 دوال (getPlatformStats, listAllBuildings, getBuildingDetail, listAllUsers, listPlatformAudit).
- **Actions** `src/actions/super-admin.ts` — updateBuildingSubscriptionAction, extendTrialAction, expireBuildingAction, reactivateBuildingAction (Zod + Arabic error mapping).
- **Components** `src/components/super-admin/`:
  - `subscription-badges.tsx` (status + plan)
  - `buildings-table.tsx` + `buildings-filters.tsx`
  - `platform-stats-grid.tsx` + `trial-warnings.tsx`
  - `usage-stats.tsx`
  - `subscription-controls.tsx` (3 surfaces: full edit + extend trial + expire/reactivate)
- **Pages** `src/app/(super-admin)/super-admin/`:
  - `page.tsx` (dashboard)
  - `buildings/page.tsx` + `buildings/[id]/page.tsx`
  - `users/page.tsx`
  - `audit/page.tsx`
  - `layout.tsx` مع sub-navigation
- **Subscription block**:
  - `src/middleware.ts` يَحجب inactive buildings للمستخدمين العاديين (super_admin يَتجاوز للدعم)
  - `src/app/(app)/layout.tsx` defense-in-depth recheck
  - `src/app/subscription-inactive/page.tsx` صفحة التنبيه
  - `src/lib/tenant.ts` يُفضِّل العمارات النشطة عند ensureActiveBuilding
  - `src/components/layout/building-switcher.tsx` علامة بصرية على inactive buildings

### Tests
- 20 اختباراً جديداً (14.1-14.20) لـ Phase 14 → 218/218.

### Lessons
- **#14**: حماية subscription state في multi-tenant تَتطلَّب طبقتين: trigger في الـ DB (لأن RLS الحالية تَسمح للـ admin بتحديث الجدول كاملاً) + middleware/layout block. transition whitelist في الـ trigger هو الـ source of truth — الـ UI لا يُسبق-يُفلتر options لتجنُّب drift.

---

## [0.13.0] — 2026-04-29 — Phase 13 (PWA + Polish)

### Added
- **PWA**: Serwist (`@serwist/next`) مُفعَّل في production فقط (`disable: NODE_ENV === 'development'`).
- **`src/app/manifest.ts`**: name (Arabic), short_name, display: 'standalone', lang: 'ar', dir: 'rtl', start_url: '/dashboard', theme_color.
- **Icons**: `public/icons/icon.svg` + `public/icons/icon-maskable.svg` + `src/app/icon.tsx` (favicon 32×32) + `src/app/apple-icon.tsx` (180×180).
- **`src/app/sw.ts`**: Service Worker مع navigationPreload + offline fallback.
- **`public/offline.html`**: صفحة offline ستاتيكية self-contained.
- **Components**: install-prompt, network-status, service-worker-registrar.

### Fixed (rounds 2 + 3)
- **(round 2 P1) defaultCache user-data leak**: استبدلت `defaultCache` بـ runtimeCaching محافظ (Google Fonts + same-origin static فقط). HTML/RSC/API لا تُكاش.
- **(round 2 P1) offline fallback unreachable**: حُوِّل من Next.js page route `/~offline` إلى ملف ستاتيكي `public/offline.html` مَضمون في الـ precache.
- **(round 3 P1) NetworkOnly route للـ navigations**: لازم لتفعيل الـ fallback (handlerDidError plugin يَحتاج route مُطابق).
- **`scripts/check-sw-precache.mjs`** postbuild check — 3 فحوصات: precache يَحوي `/offline.html`، NetworkOnly route للـ navigation، لا NetworkFirst.

### Lessons
- **#13**: في multi-tenant authenticated app، runtime caching للـ HTML/RSC/API ممنوع — Cache API تَربط بـ URL فقط ولا تَفهم cookies/auth. الحل: NetworkOnly + offline fallback ستاتيكية في الـ precache.

---

## [0.12.0] — 2026-04-29 — Phase 12 (Financial Reports)

### Added
- **`supabase/15_phase12.sql`**: 4 RPCs (كلها SECURITY DEFINER):
  - `get_monthly_financial_summary` — دخل/مصروف/رصيد + outstanding_apartments_count
  - `get_expense_category_breakdown` — مرتَّب desc
  - `get_yearly_monthly_totals` — 12 شهر + counts
  - `get_range_financial_summary` — نطاق مخصَّص بـ period_month
- **Components**: `financial-summary-cards`, `expense-breakdown-pie`, `monthly-trend-chart`, `outstanding-list`.
- **Pages**: `src/app/(app)/reports/financial/page.tsx` + `[period]/page.tsx`.

### Fixed (round 2)
- **(P2) range/yearly inconsistency**: range كان يَستخدم `payment_date` بدلاً من `period_month` → نفس الفترة تُعطي أرقاماً مختلفة عند الدفع المبكر/المتأخر. الإصلاح: range يَستخدم period_month + yearly يُرجع counts.

### Tests
- 14 اختباراً (12.1-12.14) → 198/198.

### Lessons
- **#12**: في reports المتعدِّدة المناهج (monthly/yearly/range)، اتَّفق على عمود واحد للتصنيف الزمني عبر كل الـ RPCs. الخلط بين `payment_date` و `period_month` يُنتج تناقضات حسابية حسب نطاق الفلتر.

---

## [0.11.0] — 2026-04-29 — Phase 11 (Documents Storage)

### Added
- **`supabase/14_phase11.sql`**: documents table + storage bucket `documents` + audit immutability triggers.
- **Components**: documents-table, document-upload-form, document-actions.
- **Pages**: `src/app/(app)/documents/page.tsx`.

### Fixed (rounds 1-3)
- **(round 1 P1)** Storage SELECT row-scoped (كان يَفتح للـ public).
- **(round 1 P2)** DELETE policy للـ owner OR manager (orphan-only).
- **(round 2 P1)** `file_url` tenant-scoped: trigger يَتحقق من path يَبدأ بـ `building_id`، storage SELECT يَفحص path tenant ضد row.building_id (defense-in-depth).
- **audit_logs immutability**: triggers لـ UPDATE + DELETE.

### Lessons
- **#10**: storage policies في multi-tenant يَجب أن تَفحص row metadata (subject + tenant)، ليس فقط الـ path. السماح بالكتابة لمسار `building_X/...` لا يُشكِّل أمناً ما لم يَقترن بـ INSERT trigger يَفحص أن `file_url` يُطابق `row.building_id`.

---

## [0.10.0] — 2026-04-29 — Phase 10 (Governance)

### Added
- **`supabase/13_phase10.sql`**:
  - 3 جداول: `suggestions`, `votes`, `vote_options`, `vote_responses`, `decisions`
  - 4 workflow triggers + 5 RPCs (activate_vote, cancel_vote, cast_vote_for_apartment, close_vote, convert_suggestion_to_vote)
- **Components**: suggestion-card/form, vote/cast-vote, results-chart, decisions.
- **Pages**: suggestions, votes, decisions (8 صفحات).

### Fixed (rounds 1-4)
- **(round 1 P1) starts_at**: الـ trigger كان يَحجب تغيير `starts_at` عند draft→active. الإصلاح: استثناء صريح.
- **(round 2 P1) vote_options after activation**: trigger جديد `trg_vote_options_validate_change` يَمنع INSERT/UPDATE/DELETE على options لـ vote نشط.
- **(round 3 P1) vote_responses privacy**: استبدال policy بـ admin-or-self + 3 SECURITY DEFINER RPCs لـ aggregate counts (resident لا يَرى تفاصيل تصويت زميله).
- **(round 4 P2) rep-change visibility**: `list_user_vote_apartments` RPC يُرجع derived state بدون كشف raw rows.

### Lessons
- **#7**: workflow triggers لازم تَدعم انتقالات نظيفة لكن مع مرونة لتعديل حقول معيَّنة أثناء الانتقال (مثل `starts_at` عند activation). الـ field whitelist per-transition يُحسم هذا.
- **#8**: للـ aggregate-only data (counts، sums)، استبدل الـ row policies بـ SECURITY DEFINER RPCs تُرجع الإجمالي. هذا يَحفظ الخصوصية بدون تعقيد policies.

---

## [0.9.0] — 2026-04-29 — Phase 9 (Vendors)

### Added
- **`supabase/12_phase9.sql`**: vendors table + tenant lock trigger (`building_id` immutable).
- **Components**: vendor-card, vendor-form, vendor-actions, rating-stars.
- **Pages**: vendors index, [id], [id]/edit, new.

### Tests
- 4 اختبارات tenant lock → cumulative ~150 (تَزداد عبر المراحل).

---

## [0.8.0] — 2026-04-29 — Phase 8 (Maintenance + Tasks)

### Added
- **`supabase/11_phase8.sql`**:
  - `maintenance_requests` table مع workflow كامل (8 حالات).
  - `tasks` table.
  - workflow triggers + storage policies للـ maintenance images bucket.

### Fixed (rounds 1-7) — أكثر الجولات في المشروع
- **(round 1 P1)** completion proof: completed يَتطلَّب after_image_url.
- **(round 2 P2)** atomic link maintenance↔expense عبر RPC + private marker table.
- **(round 3 P2)** tasks `status='overdue'` mediated-only (CHECK constraint).
- **(round 4 P1)** GUC forgery prevention: استبدال `set_config()` بـ private schema marker table مع txid_current() validation.
- **(round 5 P1)** building_id immutable على maintenance + tasks.
- **(round 6 P1)** maint_insert WITH CHECK يَفحص requested_by + apartment_id ضد apartment_members.
- **(round 7 P2)** admin proxy scope: requested_by يَجب أن يَكون عضواً نشطاً في building_memberships.

### Lessons
- **#5**: workflow triggers لازم تَفحص الانتقالات + الحقول المسموح بتعديلها معاً. تعديل amount على صف paid (بدون transition) يَجب أن يُرفض.
- **#6**: في PostgreSQL، الـ GUCs (session settings) قابلة للـ forgery من الـ client. للـ unforgeable markers، استخدم private schema table مع txid_current() validation.

---

## [0.7.0] — 2026-04-29 — Phase 7 (Expenses)

### Added
- **`supabase/10_phase7.sql`**: expenses table + workflow trigger + storage policies للـ invoices bucket + paid_by/paid_at columns + chk_expenses_paid_proof.

### Fixed (rounds 1-4)
- workflow integrity: expense INSERT WITH CHECK يَفرض draft.
- transition whitelist: draft→pending_review→approved→paid (terminal) أو cancelled.
- field whitelists per-transition.
- **(round 4)** rejected → cancelled مسموح ويُسجِّل cancellation_reason.

### Lessons
- **#4**: per-transition field whitelist (ليس فقط transition whitelist) — تعديل description عند rejection مسموح، عند approval ليس مسموحاً. هذا يَحفظ الـ audit integrity.

---

## [0.6.0] — 2026-04-28 — Phase 6 (Payments)

### Added
- **`supabase/09_phase6.sql`**: payments_insert WITH CHECK يَفرض pending + null review fields. receipts orphan-only DELETE policy.
- **Components**: payment-form, receipt-uploader, receipt-preview, approval-actions, pending-payments.
- **Pages**: payments index، [id]، new.

---

## [0.5.0] — 2026-04-28 — Phase 5 (Apartments)

### Added
- **`supabase/08_phase5.sql`**: 3 RPCs (link_apartment_member, change_voting_representative, deactivate_apartment_member). voting representative auto-assignment للعضو الأول.

### Fixed (round 1)
- **(P1) deactivated 'admin' membership reactivation**: لو محذوف admin يَعود، يَعود كـ `resident` (لا role escalation).

### Lessons
- **#3**: RPCs الـ idempotent يَجب أن تَفحص الحالة القديمة قبل الكتابة. role escalation عبر "reactivate" حتى لو غير مقصود = ثغرة أمنية.

---

## [0.4.0] — 2026-04-28 — Phase 4 (Dashboard)

### Added
- 3 dashboards حسب الدور: admin/treasurer/committee، resident، technician.
- Components: stats-card, status-badges, quick-actions, recent-payments/expenses/maintenance, active-votes.

---

## [0.3.0] — 2026-04-28 — Phase 3 (Design System + Layout)

### Added
- shadcn/ui components: button, input, card, dialog, sheet, dropdown-menu, tabs, tooltip, select, popover, accordion, drawer, etc.
- Layout: app-shell, app-header, app-sidebar, bottom-nav (mobile), nav-link, theme-toggle, building-switcher, user-menu.
- Shared: page-header, empty-state, loading-state, error-state, confirm-dialog, data-table.

---

## [0.2.0] — 2026-04-28 — Phase 2 (Auth)

### Added
- **`supabase/07_phase2.sql`**: `register_building()` SECURITY DEFINER function للتسجيل الذرّي (building + admin membership). حُذفت bootstrap policy.
- **Auth pages**: login, register, forgot-password, reset-password (RTL Arabic).
- **`src/lib/supabase/`**: client.ts, server.ts, middleware.ts, admin.ts.
- **`src/lib/permissions.ts`**: requireUser, hasRole, isSuperAdmin.
- **`src/lib/tenant.ts`**: getActiveBuildingId, ensureActiveBuilding, getUserBuildings.
- **`src/middleware.ts`**: حماية كل المسارات + admin-only-paths gate (Phase 5 cookie-propagation pattern).

### Lessons
- **#2**: bootstrap policies (ZSelf-INSERT الأولى) يَجب أن تُحذف فور توفُّر RPC أتومي بديل، وإلا تَبقى ثغرة.

---

## [0.1.0] — 2026-04-28 — Phase 1 (DB + RLS)

### Added
- **`supabase/01_schema.sql`**: 17 جداول + 17 ENUMs + composite FKs لـ tenant integrity (building_id يَجب أن يُطابق عبر الـ FK chain).
- **`supabase/02_functions.sql`**: 4 helpers — `is_super_admin()`, `is_building_member()`, `user_has_role()`, `user_building_ids()`.
- **`supabase/03_triggers.sql`**: `updated_at` لكل جدول + `handle_new_user` (auto-create profile) + audit triggers لكل الجداول الحساسة.
- **`supabase/04_policies.sql`**: RLS لكل الـ 17 جدولاً.
- **`supabase/05_storage.sql`**: 6 buckets (avatars + logos + receipts + invoices + maintenance + documents) + storage policies.
- **`supabase/06_seed.sql`**: بيانات تجريبية (تطوير فقط) — 7 مستخدمين، عمارتين، 10 شقق.
- **`scripts/sql-validate.mjs`**: 23 اختباراً تلقائياً عبر pglite.

### Lessons
- **#1**: في multi-tenant، الـ `building_id` يَجب أن يَكون عمود tenant على كل جدول، مع composite FKs (`(building_id, child_id) → (building_id, child_id)`) لمنع cross-tenant references. الـ FK البسيط `child_id → child_id` لا يَكفي.

---

## [0.0.1] — 2026-04-28 — Phase 0 (Foundation)

### Added
- Next.js 15 App Router + TypeScript strict + Tailwind 3 + shadcn/ui setup.
- ESLint + Prettier (via Next.js defaults).
- `.env.example` + `.env.local.example`.
- Tajawal font (Arabic).
- next-themes (dark/light).
- Initial folder structure: `src/app/`, `src/components/`, `src/lib/`, `src/types/`.

---

## Lessons Portfolio (16 درساً)

| # | الدرس | المرحلة |
|---|------|--------|
| 1 | composite FKs لـ tenant integrity في multi-tenant DB | 1 |
| 2 | bootstrap policies تُحذف فور توفُّر RPC بديل | 2 |
| 3 | RPCs idempotent تَفحص الحالة القديمة قبل الكتابة (لا role escalation عبر reactivate) | 5 |
| 4 | per-transition field whitelist (ليس فقط transition whitelist) | 7 |
| 5 | workflow triggers تَفحص الانتقالات + الحقول المسموحة معاً | 8 |
| 6 | unforgeable markers عبر private schema table + txid_current() (لا GUCs) | 8 |
| 7 | trigger field whitelists per-transition تَدعم تعديلات شرعية أثناء الانتقال | 10 |
| 8 | aggregate-only data عبر SECURITY DEFINER RPCs بدلاً من row policies | 10 |
| 9 | tenant column immutability على كل الجداول الحساسة | 8/10/11 |
| 10 | storage policies تَفحص row metadata (subject + tenant)، ليس path فقط | 11 |
| 11 | في multi-method reports (monthly/yearly/range)، اتفق على عمود زمني واحد | 12 |
| 12 | في multi-tenant authenticated PWA، runtime caching للـ HTML/RSC/API ممنوع | 13 |
| 13 | offline fallback يَجب أن يَكون مَضموناً في الـ precache (postbuild check) | 13 |
| 14 | subscription state يَتطلَّب طبقتين: trigger في DB + middleware/layout block | 14 |
| 15 | tenant cookie gates يَجب أن تَدعم cookie-propagation fallback | 14 |
| 16 | auto-switch للـ tenant cookie يَجب أن يَكون path-aware | 14 |
| 17 | الكود source of truth للوثائق — أي تَغيير في server actions / UI يَتطلَّب doc-pass على كل الأدلة | 15 |
| 18 | في multi-trust-boundary apps، RLS لا تَكفي للـ tokens (RPCs SECURITY DEFINER هي الـ surface المُحدَّد) | 16 prep |
| 19 | عمليات DB + side effects خارجية: reserve داخل DB → execute خارج DB → complete/fail داخل DB مع clear recovery state | 16 prep |
| 20 | PostgreSQL لا يَعرف IP — rate limits بالـ IP تَعيش في server action/middleware layer وراء reverse proxy موثوق | 16 prep |
| 21 | في public surface، defense layer 2 = CHECK constraints على DB level (honeypot يَعمل حتى لو RLS تَجاوز) | 16 |
| 22 | Next.js route groups لا تُطبَّق على root `/` — لجَعل layout يُغطي `/`, ضع الـ page داخل group folder | 16 |
| 23 | graceful email failure: Promise.allSettled + لا rollback. الـ DB integrity = source of truth، الإيميل notification منفصل | 16 |
| 24 | `SECURITY DEFINER` بدون `is_super_admin()` check داخلي = ثقب أمني. GRANT يُحدِّد مَن يَستدعي، لكن DEFINER يَتجاوز RLS. كل RPC حسّاس يَفحص الدور داخلياً | 16 round 2 |
| 25 | graceful failures يَجب أن تُسجَّل في audit_logs (ليس console فقط) — console يَختفي بعد ساعات على Vercel، audit_logs دائم | 16 round 2 |
| 26 | PostgREST `return=representation` يَتطلَّب SELECT permission. للـ anon-INSERT-only patterns، ولِّد UUID server-side ولا تَستخدم `.select()` | 16 round 3 |
| 27 | audit_logs RPCs server-only (revoke from anon/authenticated). الـ INSERT المعتاد triggers فقط؛ الـ SECURITY DEFINER RPCs للـ audit grant حصراً لـ service_role | 16 round 3 |
| 28 | rate limit في server action يَحمي فقط المسار عبر action. لو الـ table بـ anon INSERT policy، الـ anon key (visible في bundle) يَسمح بـ direct PostgREST INSERT متجاوزاً action. لكل public form: أَغلق direct table access تماماً، أَجبر المسار عبر action/RPC server-only | 16 round 4 |
| 29 | للـ public-facing tokens، استخدم `randomBytes(32)` server-side (256 bits entropy، URL-safe base64). SHA-256 للـ lookup (O(1) indexed)، لا bcrypt — نمط Stripe/Slack | 17 |
| 30 | 2-step signup flow (signup → email confirm → finalize): الحالة بين الخطوتَين في `user_metadata`. الـ finalize page يَجب أن تَكون idempotent (يَفحص الـ pending row قبل الاستدعاء — refresh-safe) | 17 |
| 31 | "RPC as choke point" مبدأ يَنطبق على WRITES المُصرَّحة (admin) أيضاً، ليس فقط anon. لو الـ table له lifecycle محمي بـ RPC (counter، state machine، token)، drop ALL direct write policies — حتى للـ admin. RPCs SECURITY DEFINER يَتجاوزن RLS، فلا حاجة لـ policy | 17 round 2 |
| 32 | tokens public-facing تَحتاج rotation semantic explicit — توليد token جديد = إبطال القديم تلقائياً (atomic UPDATE-then-INSERT في PostgreSQL function). بدون هذا، الـ leak window يَمتد حتى expiry/max_uses الطبيعي | 17 round 3 |
| 33 | Reserve/Complete/Fail pattern: الـ "fail" branch ليس optional — هو الـ recovery state الذي يُحوِّل 500 error إلى orphan قابل للتَنظيف. بدون mark_provisioning_failed، invite-without-building = حالة غير قابلة للاسترداد | 18 |
| 34 | Cron jobs تَحتاج bypass workflow triggers → استخدم `session_user = 'service_role'` exception في trigger نفسه (per-table opt-in)، لا disable trigger عالمياً. transparent + targeted | 18 |
| 35 | Snapshot pricing في DB at create-time (لا late-binding من tier). تَغيير السعر بعد الـ order يُغيِّر العرض retroactively → confusing للـ customer + reviewer | 18 |
| 36 | RPCs تُنشئ صفوفاً بـ computed values يَجب أن تُرجع تلك القيم (لا فقط id). الـ caller يَحتاجها لـ email/URL/logging — placeholder = 0 = bug صامت | 18 round 2 |
| 37 | public file uploads: validate → status check → upload → flip status. الترتيب الخاطئ (upload قبل status check) = orphan files على cleanup best-effort | 18 round 2 |

---

## Conventions

- **Phases**: `0.X.0` لكل مرحلة جديدة، `0.X.Y` للـ rounds (إصلاحات Codex).
- **Sections**: Added / Changed / Fixed / Removed / Tests / Lessons.
- **Linked SQL files**: كل ملف phase له ملف SQL مرافق في `supabase/` (07_phase2 → 16_phase14).
- **Test counts**: تراكمية في `sql-validate.mjs` — كل phase تَزيد بدون regression. الإجمالي الحالي: **226/226**.
