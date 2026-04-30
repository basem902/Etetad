-- =============================================
-- 09_phase6.sql — Phase 6 hardening (Codex review)
-- =============================================
-- يطبَّق بعد 08_phase5.sql.
-- يعالج ملاحظتين أمنيتين/سلوكيتين على المرحلة 6:
--   1) RLS تسمح بـ INSERT بحالة approved مباشرة (Codex P1)
--   2) deleteReceipt rollback لا يعمل (لا DELETE policy على receipts) (Codex P2.2)
-- =============================================

-- =============================================
-- (1) Tighten payments INSERT policy — workflow integrity
-- =============================================
-- المشكلة: السياسة السابقة تتحقق من العضوية/الشقة فقط، لكنها لا تمنع
-- مستخدماً غير admin من تعيين status='approved' أو ملء approved_by مباشرة
-- عبر Supabase client. هذا يجعل أي ساكن يستطيع تجاوز مراجعة أمين الصندوق.
--
-- الحل: اشتراط أن INSERT يُنشئ صفاً بحالة pending فقط، بدون أي حقل اعتماد/رفض.
-- التحوّل لـ approved/rejected يحدث حصرياً عبر UPDATE (الذي يخضع لسياسة منفصلة
-- تتطلب admin/treasurer).
-- =============================================

drop policy if exists "payments_insert" on public.payments;

create policy "payments_insert"
on public.payments for insert
to authenticated
with check (
  public.is_building_member(building_id)
  -- Workflow integrity: cannot bypass review by inserting an already-decided row.
  and status = 'pending'
  and approved_by is null
  and approved_at is null
  and rejection_reason is null
  -- Either privileged (admin/treasurer) OR an active member of the apartment.
  and (
    public.user_has_role(
      building_id,
      array['admin', 'treasurer']::public.membership_role[]
    )
    or exists (
      select 1 from public.apartment_members am
      where am.apartment_id = payments.apartment_id
        and am.user_id = auth.uid()
        and am.is_active = true
    )
  )
);

-- =============================================
-- (2) Storage: orphan-only DELETE policy on receipts bucket
-- =============================================
-- المشكلة: createPaymentAction يرفع ملف ثم يُدخل صف الدفعة. لو الـ insert فشل
-- (RLS، CHECK، race condition)، deleteReceipt يحاول الحذف لكن receipts bucket
-- لا تحوي DELETE policy، فالملف يبقى يتيماً.
--
-- الحل: سياسة DELETE محدودة:
--   - bucket_id = 'receipts'
--   - owner = auth.uid()                  ← الرافع نفسه فقط
--   - لا توجد دفعة تُشير لهذا الملف        ← orphan فقط
-- بمجرد ربط الملف بصف payment، الـ EXISTS يعود true والـ delete يُمنع.
-- "إثبات الدفع" للمدفوعات المعتمدة يبقى immutable.
-- =============================================

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
);

-- End 09_phase6.sql
