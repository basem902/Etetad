'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId } from '@/lib/tenant'
import { hasRole, isSuperAdmin } from '@/lib/permissions'
import {
  expenseCreateSchema,
  expenseUpdateSchema,
  expenseRejectSchema,
  expenseCancelSchema,
} from '@/lib/validations/expenses'
import {
  uploadInvoice,
  deleteInvoice,
  uploadExpenseReceipt,
  deleteReceipt,
  validateInvoiceFile,
  validateReceiptFile,
} from '@/lib/storage'
import type { UpdateTables } from '@/types/database'

type ActionResult<T = void> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

function fdGet(form: FormData, key: string): string | undefined {
  const v = form.get(key)
  return typeof v === 'string' ? v : undefined
}

/** Treasurer/admin/super-admin only. Used by every action in this file. */
async function ensurePrivileged(
  buildingId: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'يجب تسجيل الدخول' }
  const allowed =
    (await isSuperAdmin(user.id)) ||
    (await hasRole(buildingId, ['admin', 'treasurer'], user.id))
  if (!allowed) return { ok: false, error: 'هذه العملية لمدير العمارة أو أمين الصندوق' }
  return { ok: true, userId: user.id }
}

// =============================================
// Create — saves as 'draft' (workflow entry point)
// =============================================
export async function createExpenseAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensurePrivileged(buildingId)
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = expenseCreateSchema.safeParse({
    title: fdGet(formData, 'title'),
    description: fdGet(formData, 'description') ?? '',
    category: fdGet(formData, 'category') ?? '',
    amount: fdGet(formData, 'amount'),
    expense_date: fdGet(formData, 'expense_date'),
    vendor_id: fdGet(formData, 'vendor_id') ?? '',
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة' }
  }

  const supabase = await createClient()

  // Optional invoice upload at create-time. We pre-generate the id so the
  // path can include it before the row exists. RLS still guards the insert.
  const expenseId = crypto.randomUUID()
  const invoiceFile = formData.get('invoice')
  let invoicePath: string | null = null

  if (invoiceFile instanceof File && invoiceFile.size > 0) {
    const v = validateInvoiceFile(invoiceFile)
    if (!v.ok) return { success: false, error: v.error }
    const up = await uploadInvoice(supabase, {
      buildingId,
      expenseId,
      file: invoiceFile,
    })
    if (!up.ok) return { success: false, error: up.error }
    invoicePath = up.data.path
  }

  const { error: insErr } = await supabase.from('expenses').insert({
    id: expenseId,
    building_id: buildingId,
    title: parsed.data.title.trim(),
    description: parsed.data.description?.trim() || null,
    category: parsed.data.category?.trim() || null,
    amount: parsed.data.amount,
    expense_date: parsed.data.expense_date,
    vendor_id: parsed.data.vendor_id || null,
    status: 'draft',
    invoice_url: invoicePath,
    created_by: auth.userId,
  })

  if (insErr) {
    if (invoicePath) await deleteInvoice(supabase, invoicePath)
    if (insErr.code === '23514') {
      return { success: false, error: 'القيود رفضت المصروف. تأكد من القيم المدخلة.' }
    }
    if (insErr.code === '23503') {
      return { success: false, error: 'المورد غير صالح أو لا ينتمي للعمارة.' }
    }
    return { success: false, error: 'تعذّر إنشاء المصروف' }
  }

  revalidatePath('/expenses')
  return { success: true, data: { id: expenseId }, message: 'تم حفظ المسودّة' }
}

// =============================================
// Update — only allowed while draft or rejected (creator fixes & resubmits)
// =============================================
export async function updateExpenseAction(
  formData: FormData,
): Promise<ActionResult> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensurePrivileged(buildingId)
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = expenseUpdateSchema.safeParse({
    expense_id: fdGet(formData, 'expense_id'),
    title: fdGet(formData, 'title'),
    description: fdGet(formData, 'description') ?? '',
    category: fdGet(formData, 'category') ?? '',
    amount: fdGet(formData, 'amount'),
    expense_date: fdGet(formData, 'expense_date'),
    vendor_id: fdGet(formData, 'vendor_id') ?? '',
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة' }
  }

  const supabase = await createClient()

  // Optional invoice replacement.
  const invoiceFile = formData.get('invoice')
  let newInvoicePath: string | null = null
  if (invoiceFile instanceof File && invoiceFile.size > 0) {
    const v = validateInvoiceFile(invoiceFile)
    if (!v.ok) return { success: false, error: v.error }
    const up = await uploadInvoice(supabase, {
      buildingId,
      expenseId: parsed.data.expense_id,
      file: invoiceFile,
    })
    if (!up.ok) return { success: false, error: up.error }
    newInvoicePath = up.data.path
  }

  // Edits restricted to draft/rejected (creator workflow). Once submitted,
  // amount/title/etc. are frozen until rejected or cancelled.
  const updatePayload: UpdateTables<'expenses'> = {
    title: parsed.data.title.trim(),
    description: parsed.data.description?.trim() || null,
    category: parsed.data.category?.trim() || null,
    amount: parsed.data.amount,
    expense_date: parsed.data.expense_date,
    vendor_id: parsed.data.vendor_id || null,
  }
  if (newInvoicePath) updatePayload.invoice_url = newInvoicePath

  const { data: updated, error } = await supabase
    .from('expenses')
    .update(updatePayload)
    .eq('id', parsed.data.expense_id)
    .eq('building_id', buildingId)
    .in('status', ['draft', 'rejected'])
    .select('id')
    .maybeSingle()

  if (error) {
    if (newInvoicePath) await deleteInvoice(supabase, newInvoicePath)
    return { success: false, error: 'تعذّر تعديل المصروف' }
  }
  if (!updated) {
    if (newInvoicePath) await deleteInvoice(supabase, newInvoicePath)
    return {
      success: false,
      error: 'لا يمكن تعديل المصروف في حالته الحالية (مسموح فقط في مسودّة/مرفوض)',
    }
  }

  revalidatePath('/expenses')
  revalidatePath(`/expenses/${parsed.data.expense_id}`)
  return { success: true, message: 'تم حفظ التعديلات' }
}

// =============================================
// Submit for review (draft -> pending_review)
// =============================================
export async function submitExpenseAction(
  expenseId: string,
): Promise<ActionResult> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensurePrivileged(buildingId)
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()
  const { data: updated, error } = await supabase
    .from('expenses')
    .update({ status: 'pending_review' })
    .eq('id', expenseId)
    .eq('building_id', buildingId)
    .eq('status', 'draft')
    .select('id')
    .maybeSingle()

  if (error) return { success: false, error: 'تعذّر إرسال المصروف للمراجعة' }
  if (!updated) {
    return {
      success: false,
      error: 'لا يمكن إرسال المصروف للمراجعة من حالته الحالية',
    }
  }

  revalidatePath('/expenses')
  revalidatePath(`/expenses/${expenseId}`)
  return { success: true, message: 'تم إرسال المصروف للمراجعة' }
}

// =============================================
// Approve (pending_review -> approved)
// =============================================
export async function approveExpenseAction(
  expenseId: string,
): Promise<ActionResult> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensurePrivileged(buildingId)
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()
  const { data: updated, error } = await supabase
    .from('expenses')
    .update({
      status: 'approved',
      approved_by: auth.userId,
      approved_at: new Date().toISOString(),
    })
    .eq('id', expenseId)
    .eq('building_id', buildingId)
    .eq('status', 'pending_review')
    .select('id')
    .maybeSingle()

  if (error) return { success: false, error: 'تعذّر اعتماد المصروف' }
  if (!updated) {
    return {
      success: false,
      error: 'المصروف لم يعد بانتظار المراجعة (ربما اعتُمِد أو رُفِض من قبل عضو آخر)',
    }
  }

  revalidatePath('/expenses')
  revalidatePath(`/expenses/${expenseId}`)
  revalidatePath('/dashboard')
  return { success: true, message: 'تم اعتماد المصروف' }
}

// =============================================
// Reject (pending_review -> rejected) — reason MANDATORY
// =============================================
// We don't have a dedicated `review_note` column on expenses (cancellation_reason
// is reserved for the 'cancelled' terminal state per the CHECK in 01_schema.sql).
// We persist the reviewer's note by appending a tagged line to description so the
// creator sees it on the edit page when fixing & resubmitting. The audit_logs
// trigger captures who/when independently.
// =============================================
export async function rejectExpenseAction(
  formData: FormData,
): Promise<ActionResult> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensurePrivileged(buildingId)
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = expenseRejectSchema.safeParse({
    expense_id: fdGet(formData, 'expense_id'),
    reason: fdGet(formData, 'reason'),
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة' }
  }

  const supabase = await createClient()

  // Append the rejection note to description so the creator sees the feedback.
  // We tag it so re-submissions can strip the previous tag if needed.
  const { data: existing } = await supabase
    .from('expenses')
    .select('description')
    .eq('id', parsed.data.expense_id)
    .eq('building_id', buildingId)
    .maybeSingle()
  const tag = `[ملاحظة المراجِع: ${parsed.data.reason.trim()}]`
  const newDesc = existing?.description ? `${existing.description}\n${tag}` : tag

  const { data: updated, error } = await supabase
    .from('expenses')
    .update({
      status: 'rejected',
      description: newDesc,
      // approved_by/approved_at remain null; this is a rejection, not approval.
    })
    .eq('id', parsed.data.expense_id)
    .eq('building_id', buildingId)
    .eq('status', 'pending_review')
    .select('id')
    .maybeSingle()

  if (error) return { success: false, error: 'تعذّر رفض المصروف' }
  if (!updated) {
    return {
      success: false,
      error: 'المصروف لم يعد بانتظار المراجعة (ربما اعتُمِد أو رُفِض من قبل عضو آخر)',
    }
  }

  revalidatePath('/expenses')
  revalidatePath(`/expenses/${parsed.data.expense_id}`)
  return { success: true, message: 'تم رفض المصروف' }
}

// =============================================
// Reopen rejected (rejected -> draft) — creator/treasurer fixes & resubmits
// =============================================
// PLAN §7 + الـ trigger في 10_phase7.sql يدعم rejected → draft (المُنشئ يصلح
// ويعيد المحاولة، الـ trigger يمسح approved_by/approved_at تلقائياً).
// بدون هذا الـ action كان المصروف المرفوض عالقاً بعد التصحيح في صفحة التعديل.
export async function reopenRejectedExpenseAction(
  expenseId: string,
): Promise<ActionResult> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensurePrivileged(buildingId)
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()
  const { data: updated, error } = await supabase
    .from('expenses')
    .update({ status: 'draft' })
    .eq('id', expenseId)
    .eq('building_id', buildingId)
    .eq('status', 'rejected')
    .select('id')
    .maybeSingle()

  if (error) return { success: false, error: 'تعذّر إعادة فتح المصروف' }
  if (!updated) {
    return {
      success: false,
      error: 'المصروف ليس في حالة "مرفوض" (ربما حالته تغيّرت)',
    }
  }

  revalidatePath('/expenses')
  revalidatePath(`/expenses/${expenseId}`)
  return { success: true, message: 'تم إعادة فتح المصروف كمسودّة' }
}

// =============================================
// Mark Paid (approved -> paid) — receipt MANDATORY (proof of payment)
// =============================================
export async function markExpensePaidAction(
  formData: FormData,
): Promise<ActionResult> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensurePrivileged(buildingId)
  if (!auth.ok) return { success: false, error: auth.error }

  const expenseId = fdGet(formData, 'expense_id')
  if (!expenseId) return { success: false, error: 'معرّف المصروف مفقود' }

  const receiptFile = formData.get('receipt')
  if (!(receiptFile instanceof File) || receiptFile.size === 0) {
    return { success: false, error: 'إيصال الدفع مطلوب' }
  }
  const v = validateReceiptFile(receiptFile)
  if (!v.ok) return { success: false, error: v.error }

  const supabase = await createClient()

  const up = await uploadExpenseReceipt(supabase, {
    buildingId,
    expenseId,
    file: receiptFile,
  })
  if (!up.ok) return { success: false, error: up.error }

  const { data: updated, error } = await supabase
    .from('expenses')
    .update({
      status: 'paid',
      receipt_url: up.data.path,
      paid_by: auth.userId,
      paid_at: new Date().toISOString(),
    })
    .eq('id', expenseId)
    .eq('building_id', buildingId)
    .eq('status', 'approved')
    .select('id')
    .maybeSingle()

  if (error) {
    await deleteReceipt(supabase, up.data.path)
    if (error.code === '23514') {
      return { success: false, error: 'القيود رفضت العملية. تأكد من حالة المصروف.' }
    }
    return { success: false, error: 'تعذّر تسجيل الدفع' }
  }
  if (!updated) {
    await deleteReceipt(supabase, up.data.path)
    return {
      success: false,
      error: 'المصروف ليس في حالة "معتمد" (ربما حالته تغيّرت من قبل عضو آخر)',
    }
  }

  revalidatePath('/expenses')
  revalidatePath(`/expenses/${expenseId}`)
  revalidatePath('/dashboard')
  return { success: true, message: 'تم تسجيل الدفع' }
}

// =============================================
// Cancel (any non-terminal -> cancelled) — reason MANDATORY
// =============================================
export async function cancelExpenseAction(
  formData: FormData,
): Promise<ActionResult> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensurePrivileged(buildingId)
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = expenseCancelSchema.safeParse({
    expense_id: fdGet(formData, 'expense_id'),
    cancellation_reason: fdGet(formData, 'cancellation_reason'),
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة' }
  }

  const supabase = await createClient()
  // Trigger blocks paid/cancelled → cancelled. WHERE clause mirrors the trigger
  // whitelist (all non-terminal states) so the action's friendly error message
  // matches what the DB would enforce.
  const { data: updated, error } = await supabase
    .from('expenses')
    .update({
      status: 'cancelled',
      cancellation_reason: parsed.data.cancellation_reason.trim(),
    })
    .eq('id', parsed.data.expense_id)
    .eq('building_id', buildingId)
    .in('status', ['draft', 'pending_review', 'approved', 'rejected'])
    .select('id')
    .maybeSingle()

  if (error) {
    if (error.code === '23514') {
      return { success: false, error: 'سبب الإلغاء مطلوب (DB CHECK)' }
    }
    return { success: false, error: 'تعذّر إلغاء المصروف' }
  }
  if (!updated) {
    return {
      success: false,
      error: 'لا يمكن إلغاء المصروف في حالته الحالية (مدفوع أو ملغى مسبقاً)',
    }
  }

  revalidatePath('/expenses')
  revalidatePath(`/expenses/${parsed.data.expense_id}`)
  return { success: true, message: 'تم إلغاء المصروف' }
}
