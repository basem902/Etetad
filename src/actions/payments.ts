'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId } from '@/lib/tenant'
import { hasRole, isSuperAdmin } from '@/lib/permissions'
import {
  paymentCreateSchema,
  paymentRejectSchema,
} from '@/lib/validations/payments'
import {
  uploadReceipt,
  deleteReceipt,
  validateReceiptFile,
} from '@/lib/storage'

type ActionResult<T = void> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

function fdGet(form: FormData, key: string): string | undefined {
  const v = form.get(key)
  return typeof v === 'string' ? v : undefined
}

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
// Create payment (any building member; receipt MANDATORY)
// =============================================
export async function createPaymentAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'يجب تسجيل الدخول' }

  // Validate fields.
  const parsed = paymentCreateSchema.safeParse({
    apartment_id: fdGet(formData, 'apartment_id'),
    amount: fdGet(formData, 'amount'),
    payment_date: fdGet(formData, 'payment_date'),
    period_month: fdGet(formData, 'period_month'),
    method: fdGet(formData, 'method'),
    notes: fdGet(formData, 'notes') ?? '',
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة' }
  }

  // Receipt is REQUIRED (§1.5.1).
  const receipt = formData.get('receipt')
  if (!(receipt instanceof File) || receipt.size === 0) {
    return { success: false, error: 'الإيصال مطلوب' }
  }
  const v = validateReceiptFile(receipt)
  if (!v.ok) return { success: false, error: v.error }

  // Pre-flight (Codex P2.2): mirror RLS for payments_insert BEFORE we upload.
  // RLS will reject the insert if (a) the apartment doesn't belong to this
  // building, or (b) the caller is neither admin/treasurer nor an active
  // apartment_member of that apartment. We validate here so we don't pay the
  // upload bandwidth (and a Storage round-trip + rollback) for a doomed insert.
  // The orphan DELETE policy is the second line of defense for race conditions.
  const { data: apartmentRow, error: aptErr } = await supabase
    .from('apartments')
    .select('id, building_id')
    .eq('id', parsed.data.apartment_id)
    .eq('building_id', buildingId)
    .maybeSingle()
  if (aptErr || !apartmentRow) {
    return { success: false, error: 'الشقة غير موجودة في هذه العمارة' }
  }

  const isPrivileged =
    (await isSuperAdmin(user.id)) ||
    (await hasRole(buildingId, ['admin', 'treasurer'], user.id))
  if (!isPrivileged) {
    const { data: membershipRow } = await supabase
      .from('apartment_members')
      .select('id')
      .eq('apartment_id', parsed.data.apartment_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()
    if (!membershipRow) {
      return { success: false, error: 'لا تملك صلاحية تسجيل دفعة لهذه الشقة' }
    }
  }

  // Generate a stable payment id so the receipt path can include it before insert.
  const paymentId = crypto.randomUUID()

  // Upload after pre-flight; storage RLS is still the final guard.
  const up = await uploadReceipt(supabase, {
    buildingId,
    paymentId,
    file: receipt,
  })
  if (!up.ok) return { success: false, error: up.error }

  // Insert payment row. RLS enforces: caller is admin/treasurer, OR caller is
  // a member of the apartment_id (resident path).
  const { error: insErr } = await supabase.from('payments').insert({
    id: paymentId,
    building_id: buildingId,
    apartment_id: parsed.data.apartment_id,
    user_id: user.id,
    amount: parsed.data.amount,
    payment_date: parsed.data.payment_date,
    period_month: `${parsed.data.period_month}-01`,
    method: parsed.data.method,
    status: 'pending',
    receipt_url: up.data.path,
    notes: parsed.data.notes || null,
    created_by: user.id,
  })

  if (insErr) {
    // Best-effort rollback: remove the orphaned receipt file.
    await deleteReceipt(supabase, up.data.path)
    if (insErr.code === '23514') {
      // CHECK constraint (e.g. receipt_url empty, but we passed it; could be
      // amount/period malformed). Surface a helpful message.
      return { success: false, error: 'القيود رفضت الدفعة. تأكد من القيم المدخلة.' }
    }
    return { success: false, error: 'تعذّر إنشاء الدفعة' }
  }

  revalidatePath('/payments')
  return { success: true, data: { id: paymentId }, message: 'تم تسجيل الدفعة' }
}

// =============================================
// Approve payment
// =============================================
export async function approvePaymentAction(
  paymentId: string,
): Promise<ActionResult> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensurePrivileged(buildingId)
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()
  // Codex P2.1: .select('id').maybeSingle() so we can distinguish "0 rows
  // matched" (race condition: another reviewer already decided) from a real
  // success. Without it, Supabase returns success with empty data and we'd
  // surface a false-positive "تم اعتماد الدفعة".
  const { data: updated, error } = await supabase
    .from('payments')
    .update({
      status: 'approved',
      approved_by: auth.userId,
      approved_at: new Date().toISOString(),
      // Clear any prior rejection_reason since the row is no longer rejected.
      rejection_reason: null,
    })
    .eq('id', paymentId)
    .eq('building_id', buildingId)
    .eq('status', 'pending') // can only approve a pending payment
    .select('id')
    .maybeSingle()

  if (error) {
    return { success: false, error: 'تعذّر اعتماد الدفعة' }
  }
  if (!updated) {
    return {
      success: false,
      error: 'الدفعة لم تعد بانتظار المراجعة (ربما اعتُمِدت أو رُفِضت من قبل عضو آخر)',
    }
  }

  revalidatePath('/payments')
  revalidatePath(`/payments/${paymentId}`)
  revalidatePath('/dashboard')
  return { success: true, message: 'تم اعتماد الدفعة' }
}

// =============================================
// Reject payment (reason MANDATORY)
// =============================================
export async function rejectPaymentAction(
  formData: FormData,
): Promise<ActionResult> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensurePrivileged(buildingId)
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = paymentRejectSchema.safeParse({
    payment_id: fdGet(formData, 'payment_id'),
    rejection_reason: fdGet(formData, 'rejection_reason'),
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة' }
  }

  const supabase = await createClient()
  // Codex P2.1: same race-detection pattern as approve.
  const { data: updated, error } = await supabase
    .from('payments')
    .update({
      status: 'rejected',
      rejection_reason: parsed.data.rejection_reason.trim(),
      approved_by: auth.userId, // who rejected, for audit
      approved_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.payment_id)
    .eq('building_id', buildingId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (error) {
    if (error.code === '23514') {
      return { success: false, error: 'سبب الرفض مطلوب (DB CHECK)' }
    }
    return { success: false, error: 'تعذّر رفض الدفعة' }
  }
  if (!updated) {
    return {
      success: false,
      error: 'الدفعة لم تعد بانتظار المراجعة (ربما اعتُمِدت أو رُفِضت من قبل عضو آخر)',
    }
  }

  revalidatePath('/payments')
  revalidatePath(`/payments/${parsed.data.payment_id}`)
  return { success: true, message: 'تم رفض الدفعة' }
}
