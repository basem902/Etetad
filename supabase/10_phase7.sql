-- =============================================
-- 10_phase7.sql — Phase 7 (Finance: Expenses)
-- =============================================
-- يطبَّق بعد 09_phase6.sql.
-- يضيف بنية وحماية workflow كاملة لجدول expenses:
--   1) أعمدة paid_by/paid_at + CHECK لـ "إثبات الدفع"
--   2) تشديد expenses_insert (نفس درس Codex P1 من المرحلة 6 — لا تخطّي workflow)
--   3) Trigger لـ workflow integrity على UPDATE (transitions صالحة فقط)
--   4) Storage: invoices_delete_own_orphan (نفس درس Codex P2.2 من المرحلة 6)
-- =============================================

-- =============================================
-- (1) Columns: paid_by + paid_at + proof-of-payment CHECK
-- =============================================
-- المنطق: حالة 'paid' لا تحدث صدفة. تتطلب:
--   - paid_by: مَن سجّل الدفعة (treasurer/admin)
--   - paid_at: متى
--   - receipt_url: إيصال التحويل (proof of payment — مرآة لـ §1.5.1 على المدفوعات)
-- =============================================

alter table public.expenses
  add column if not exists paid_by uuid references auth.users(id) on delete set null,
  add column if not exists paid_at timestamptz;

-- Backfill any pre-existing 'paid' rows so the new CHECK can be enforced
-- without breaking historical data. We use approved_by/approved_at as the
-- best available proxy for who-and-when, and synthesize a placeholder
-- receipt_url so the row remains valid; the audit_logs entry from when the
-- migration ran is the real provenance trail.
update public.expenses
set
  paid_by = coalesce(paid_by, approved_by, created_by),
  paid_at = coalesce(paid_at, approved_at, updated_at, now()),
  receipt_url = coalesce(
    nullif(trim(receipt_url), ''),
    '__legacy_pre_phase7__/' || id::text
  )
where status = 'paid'
  and (paid_by is null or paid_at is null or receipt_url is null or trim(receipt_url) = '');

-- CHECK: status='paid' implies all three proof fields are present.
alter table public.expenses
  drop constraint if exists chk_expenses_paid_proof;

alter table public.expenses
  add constraint chk_expenses_paid_proof
  check (
    status <> 'paid'
    or (
      paid_by is not null
      and paid_at is not null
      and receipt_url is not null
      and length(trim(receipt_url)) > 0
    )
  );

-- CHECK: status='approved' (or downstream) implies approved_by/approved_at present.
-- 'approved' و 'paid' كلاهما "مرّ بالاعتماد"، لذا approved_by ضروري.
alter table public.expenses
  drop constraint if exists chk_expenses_approved_meta;

alter table public.expenses
  add constraint chk_expenses_approved_meta
  check (
    status not in ('approved', 'paid')
    or (approved_by is not null and approved_at is not null)
  );

-- =============================================
-- (2) Tighten expenses_insert — force status='draft' on creation
-- =============================================
-- Codex P1 (من المرحلة 6) مطبَّقاً على المصروفات:
-- السياسة السابقة تتحقق من الدور فقط، فيمكن لـ admin/treasurer إنشاء صف
-- بحالة 'paid' مباشرة، متجاوزاً سير العمل وكامل الـ audit trail لمراحل الاعتماد.
-- نشترط هنا أن INSERT يبدأ من 'draft' فقط، بدون أي حقل اعتماد/دفع/إلغاء.
-- التحوّل لباقي الحالات يحدث حصراً عبر UPDATE (الذي يحرسه expenses_transitions trigger).
-- =============================================

drop policy if exists "expenses_insert_treasurer_admin" on public.expenses;

create policy "expenses_insert_treasurer_admin"
on public.expenses for insert
to authenticated
with check (
  (
    public.user_has_role(
      building_id,
      array['admin', 'treasurer']::public.membership_role[]
    )
    or public.is_super_admin()
  )
  -- Workflow integrity: new rows must start at draft with empty review fields.
  and status = 'draft'
  and approved_by is null
  and approved_at is null
  and paid_by is null
  and paid_at is null
  and cancellation_reason is null
  and receipt_url is null
);

-- =============================================
-- (3) Workflow integrity trigger (BEFORE UPDATE)
-- =============================================
-- RLS WITH CHECK لا ترى OLD row، فلا تستطيع التحقق من شرعية transition.
-- نستخدم BEFORE UPDATE trigger يفحص (OLD.status, NEW.status) ضد قائمة بيضاء.
-- =============================================

create or replace function public.expenses_validate_transition()
returns trigger
language plpgsql
as $$
declare
  old_s public.expense_status := OLD.status;
  new_s public.expense_status := NEW.status;
begin
  -- =============================================
  -- (A) Same-status update — freeze business fields outside draft/rejected.
  -- =============================================
  -- Codex P1 (round 2): trigger السابق كان BEFORE UPDATE OF status فقط، فلو
  -- مستخدم admin/treasurer عدّل amount/vendor/invoice على صف status='paid'
  -- بدون تغيير status، الـ trigger لا يطلق أصلاً، فتُكسر terminal immutability
  -- وتتغيّر الأرقام المالية بعد إغلاق المصروف. الحل: trigger BEFORE UPDATE
  -- على الجدول كله، ومنطق صريح يجمّد الحقول التجارية في كل الحالات إلا
  -- draft/rejected (حيث المُنشئ يبني/يصلح المسودّة).
  -- =============================================
  if old_s = new_s then
    -- draft/rejected: مسودّة قيد التجهيز/الإصلاح — كل الحقول قابلة للتعديل.
    if old_s in ('draft', 'rejected') then
      return NEW;
    end if;

    -- pending_review/approved/paid/cancelled: الحقول التجارية وحقول الـ workflow
    -- مُجمَّدة. أي تعديل عليها يلزمه transition عبر action مخصَّص.
    -- IS DISTINCT FROM يعالج NULL بشكل صحيح.
    if NEW.title              is distinct from OLD.title
       or NEW.description      is distinct from OLD.description
       or NEW.category         is distinct from OLD.category
       or NEW.amount           is distinct from OLD.amount
       or NEW.expense_date     is distinct from OLD.expense_date
       or NEW.vendor_id        is distinct from OLD.vendor_id
       or NEW.invoice_url      is distinct from OLD.invoice_url
       or NEW.receipt_url      is distinct from OLD.receipt_url
       or NEW.approved_by      is distinct from OLD.approved_by
       or NEW.approved_at      is distinct from OLD.approved_at
       or NEW.paid_by          is distinct from OLD.paid_by
       or NEW.paid_at          is distinct from OLD.paid_at
       or NEW.cancellation_reason is distinct from OLD.cancellation_reason
    then
      raise exception
        'Expense in % state is locked: business fields cannot change without a status transition',
        old_s
        using errcode = 'check_violation';
    end if;

    -- لو الفعل تعديل بريء (مثلاً updated_at من trigger آخر) — يُسمح.
    return NEW;
  end if;

  -- =============================================
  -- (B) Status is changing — validate transition whitelist.
  -- =============================================
  --   draft           -> pending_review | cancelled
  --   pending_review  -> approved | rejected | cancelled
  --   rejected        -> draft (يصلح ويعيد) | cancelled (يتخلّى عنه)
  --   approved        -> paid | cancelled
  --   paid            -> (terminal — لا انتقال)
  --   cancelled       -> (terminal — لا انتقال)
  --
  -- ملاحظة (Codex round 4): rejected → cancelled مسموح بحيث كل الحالات
  -- غير-terminal تستطيع الوصول لـ cancelled (تماثل state machine + UX
  -- أنظف: المُنشئ يقرر إصلاح المصروف أو التخلّي عنه بزر واحد).
  if not (
    (old_s = 'draft'          and new_s in ('pending_review', 'cancelled'))
    or (old_s = 'pending_review' and new_s in ('approved', 'rejected', 'cancelled'))
    or (old_s = 'rejected'       and new_s in ('draft', 'cancelled'))
    or (old_s = 'approved'       and new_s in ('paid', 'cancelled'))
  ) then
    raise exception 'Invalid expense status transition: % -> %', old_s, new_s
      using errcode = 'check_violation';
  end if;

  -- العودة من 'rejected' إلى 'draft' تمسح حقول المراجعة (المُنشئ يبدأ صفحة بيضاء).
  -- يحدث قبل validation الحقول حتى لا يحسب التغيير "غير مسموح".
  if old_s = 'rejected' and new_s = 'draft' then
    NEW.approved_by := null;
    NEW.approved_at := null;
  end if;

  -- الانتقال لـ 'paid' يستلزم receipt_url (إثبات دفع).
  if new_s = 'paid' and (NEW.receipt_url is null or length(trim(NEW.receipt_url)) = 0) then
    raise exception 'Cannot mark expense as paid without a receipt_url'
      using errcode = 'check_violation';
  end if;

  -- الانتقال لـ 'cancelled' يستلزم cancellation_reason.
  if new_s = 'cancelled' and (NEW.cancellation_reason is null or length(trim(NEW.cancellation_reason)) = 0) then
    raise exception 'Cannot cancel expense without cancellation_reason'
      using errcode = 'check_violation';
  end if;

  -- =============================================
  -- (C) Per-transition field-change whitelist (Codex P1 round 3)
  -- =============================================
  -- درس Codex round 2 أغلق same-status edits، لكن status-changing branch ظل
  -- يقبل أي تعديل على الحقول التجارية إلى جانب transition شرعي. مثال خطر:
  --   update expenses set status='approved', approved_by=..., approved_at=now(), amount=999
  --     where id=... and status='pending_review';
  -- الانتقال شرعي والـ whitelist يقبله، لكن amount يتغيّر أثناء اعتماد يبدو
  -- نظيفاً. الحل: لكل transition، حدّد الحقول المسموح لها بالتغيّر صراحة،
  -- وارفض أي تغيّر خارج تلك القائمة.
  -- =============================================

  -- (C.1) حقول جوهرية مُجمَّدة في كل transition بدون استثناء:
  -- title / category / amount / expense_date / vendor_id / invoice_url
  -- (الفاتورة ترتبط بالمصروف في الإنشاء، ولا تُستبدل أثناء الـ workflow.)
  if NEW.title          is distinct from OLD.title
     or NEW.category    is distinct from OLD.category
     or NEW.amount      is distinct from OLD.amount
     or NEW.expense_date is distinct from OLD.expense_date
     or NEW.vendor_id   is distinct from OLD.vendor_id
     or NEW.invoice_url is distinct from OLD.invoice_url
  then
    raise exception
      'Cannot change core business fields (title/category/amount/expense_date/vendor_id/invoice_url) during transition % -> %',
      old_s, new_s
      using errcode = 'check_violation';
  end if;

  -- (C.2) description: يُسمح بتغيّره فقط في pending_review -> rejected
  -- (المراجِع يُلحق ملاحظة في وصف المصروف ليراها المُنشئ).
  if NEW.description is distinct from OLD.description
     and not (old_s = 'pending_review' and new_s = 'rejected')
  then
    raise exception
      'description can only change during pending_review -> rejected (review note)'
      using errcode = 'check_violation';
  end if;

  -- (C.3) approved_by / approved_at:
  --   pending_review -> approved: تُضبط (CHECK يفرض NOT NULL)
  --   rejected -> draft: تُمسح تلقائياً (طُبِّق فوق)
  --   أي transition آخر: ممنوع تغيّرهما.
  if not (
    (old_s = 'pending_review' and new_s = 'approved')
    or (old_s = 'rejected' and new_s = 'draft')
  ) then
    if NEW.approved_by is distinct from OLD.approved_by
       or NEW.approved_at is distinct from OLD.approved_at
    then
      raise exception
        'approved_by/approved_at cannot change during transition % -> %',
        old_s, new_s
        using errcode = 'check_violation';
    end if;
  end if;

  -- (C.4) paid_by / paid_at: يتغيّران فقط في approved -> paid.
  if not (old_s = 'approved' and new_s = 'paid') then
    if NEW.paid_by is distinct from OLD.paid_by
       or NEW.paid_at is distinct from OLD.paid_at
    then
      raise exception
        'paid_by/paid_at cannot change during transition % -> %',
        old_s, new_s
        using errcode = 'check_violation';
    end if;
  end if;

  -- (C.5) receipt_url: يتغيّر فقط في approved -> paid (إثبات الدفع).
  -- الفاتورة (invoice_url) مغطّاة في C.1 — هذه فقط لإيصال التحويل.
  if not (old_s = 'approved' and new_s = 'paid') then
    if NEW.receipt_url is distinct from OLD.receipt_url then
      raise exception
        'receipt_url cannot change during transition % -> % (only approved -> paid sets it)',
        old_s, new_s
        using errcode = 'check_violation';
    end if;
  end if;

  -- (C.6) cancellation_reason: يتغيّر فقط حين الـ target = cancelled.
  if new_s <> 'cancelled' and NEW.cancellation_reason is distinct from OLD.cancellation_reason then
    raise exception
      'cancellation_reason cannot change unless transitioning to cancelled (target=%)',
      new_s
      using errcode = 'check_violation';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_expenses_validate_transition on public.expenses;

-- BEFORE UPDATE على الجدول كله (لا OF status فقط) — درس Codex round 2.
create trigger trg_expenses_validate_transition
  before update on public.expenses
  for each row
  execute function public.expenses_validate_transition();

-- =============================================
-- (4a) Storage: orphan-only DELETE on invoices bucket
-- =============================================
-- Codex P2.2 (من المرحلة 6) مطبَّقاً على الفواتير:
-- لو فشل insert/update لصف expense بعد رفع invoice file، نحتاج rollback يعمل.
-- بدون DELETE policy، الملف يبقى يتيماً.
--
-- السياسة: حذف مسموح فقط عند:
--   - bucket_id = 'invoices'
--   - owner = auth.uid()
--   - لا يوجد expense.invoice_url يُشير لهذا الملف (orphan)
-- بمجرد ربط الملف بصف expense، EXISTS = true والحذف ممنوع → فاتورة معتمدة immutable.
-- =============================================

create policy "invoices_delete_own_orphan"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'invoices'
  and owner = auth.uid()
  and not exists (
    select 1 from public.expenses
    where invoice_url = storage.objects.name
  )
);

-- =============================================
-- (4b) Storage: extend receipts orphan check to cover expenses.receipt_url
-- =============================================
-- في المرحلة 6، receipts_delete_own_orphan فحص فقط public.payments.receipt_url.
-- الآن المصروفات أيضاً تخزّن "إثبات الدفع" في bucket receipts (path:
-- {building_id}/expenses/{expense_id}/receipt.<ext>). إعادة إنشاء السياسة
-- لتفحص الجدولين معاً، فلا يُحذف ملف مرتبط بـ payment أو expense.
-- =============================================

drop policy if exists "receipts_delete_own_orphan" on storage.objects;

create policy "receipts_delete_own_orphan"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'receipts'
  and owner = auth.uid()
  and not exists (
    select 1 from public.payments
    where receipt_url = storage.objects.name
  )
  and not exists (
    select 1 from public.expenses
    where receipt_url = storage.objects.name
  )
);

-- End 10_phase7.sql
