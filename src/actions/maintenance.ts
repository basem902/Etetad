'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId } from '@/lib/tenant'
import { hasRole, isSuperAdmin } from '@/lib/permissions'
import {
  maintenanceCreateSchema,
  maintenanceAssignSchema,
  maintenanceQuoteSchema,
} from '@/lib/validations/maintenance'
import {
  uploadMaintenanceImage,
  deleteMaintenanceImage,
  validateMaintenanceImage,
} from '@/lib/storage'

type ActionResult<T = void> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

function fdGet(form: FormData, key: string): string | undefined {
  const v = form.get(key)
  return typeof v === 'string' ? v : undefined
}

async function ensureAuth(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'يجب تسجيل الدخول' }
  return { ok: true, userId: user.id }
}

async function ensureManager(
  buildingId: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const auth = await ensureAuth()
  if (!auth.ok) return auth
  const allowed =
    (await isSuperAdmin(auth.userId)) ||
    (await hasRole(buildingId, ['admin', 'committee'], auth.userId))
  if (!allowed) {
    return { ok: false, error: 'هذه العملية لمدير العمارة أو اللجنة' }
  }
  return { ok: true, userId: auth.userId }
}

// =============================================
// Create — any building member can submit a request
// =============================================
export async function createMaintenanceRequestAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensureAuth()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = maintenanceCreateSchema.safeParse({
    title: fdGet(formData, 'title'),
    description: fdGet(formData, 'description') ?? '',
    location_type: fdGet(formData, 'location_type'),
    priority: fdGet(formData, 'priority'),
    apartment_id: fdGet(formData, 'apartment_id') ?? '',
  })
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة',
    }
  }

  const supabase = await createClient()
  const requestId = crypto.randomUUID()

  // Optional 'before' image upload.
  const file = formData.get('before_image')
  let beforePath: string | null = null
  if (file instanceof File && file.size > 0) {
    const v = validateMaintenanceImage(file)
    if (!v.ok) return { success: false, error: v.error }
    const up = await uploadMaintenanceImage(supabase, {
      buildingId,
      requestId,
      kind: 'before',
      file,
    })
    if (!up.ok) return { success: false, error: up.error }
    beforePath = up.data.path
  }

  const { error: insErr } = await supabase.from('maintenance_requests').insert({
    id: requestId,
    building_id: buildingId,
    title: parsed.data.title.trim(),
    description: parsed.data.description?.trim() || null,
    location_type: parsed.data.location_type,
    priority: parsed.data.priority,
    status: 'new',
    apartment_id: parsed.data.apartment_id || null,
    requested_by: auth.userId,
    before_image_url: beforePath,
  })

  if (insErr) {
    if (beforePath) await deleteMaintenanceImage(supabase, beforePath)
    return { success: false, error: 'تعذّر إنشاء طلب الصيانة' }
  }

  revalidatePath('/maintenance')
  return {
    success: true,
    data: { id: requestId },
    message: 'تم تسجيل طلب الصيانة',
  }
}

// =============================================
// Move to "reviewing" — admin/committee
// =============================================
export async function reviewMaintenanceAction(
  requestId: string,
): Promise<ActionResult> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensureManager(buildingId)
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()
  const { data: updated, error } = await supabase
    .from('maintenance_requests')
    .update({ status: 'reviewing' })
    .eq('id', requestId)
    .eq('building_id', buildingId)
    .in('status', ['new', 'reopened'])
    .select('id')
    .maybeSingle()

  if (error) return { success: false, error: 'تعذّر تحديث الحالة' }
  if (!updated) {
    return {
      success: false,
      error: 'لا يمكن نقل الطلب لحالة المراجعة من حالته الحالية',
    }
  }

  revalidatePath('/maintenance')
  revalidatePath(`/maintenance/${requestId}`)
  return { success: true, message: 'تم نقل الطلب للمراجعة' }
}

// =============================================
// Assign technician + (optional) quote — admin/committee
// =============================================
// Path 1 (with quote): reviewing -> waiting_quote (set assignee + cost), then waiting_quote -> waiting_approval
// Path 2 (skip quote): reviewing -> waiting_approval (set assignee directly)
// We expose a single action that handles both.
export async function assignTechnicianAction(
  formData: FormData,
): Promise<ActionResult> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensureManager(buildingId)
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = maintenanceAssignSchema.safeParse({
    request_id: fdGet(formData, 'request_id'),
    technician_id: fdGet(formData, 'technician_id'),
    cost: fdGet(formData, 'cost'),
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة' }
  }

  const supabase = await createClient()

  // Fetch current row to decide target status.
  const { data: row } = await supabase
    .from('maintenance_requests')
    .select('status')
    .eq('id', parsed.data.request_id)
    .eq('building_id', buildingId)
    .maybeSingle()
  if (!row) return { success: false, error: 'الطلب غير موجود' }

  // From 'reviewing', go to waiting_approval (skip quote — cost is known).
  // From 'waiting_quote', go to waiting_approval (got the quote).
  // Both transitions allow assigned_to + cost changes.
  if (row.status !== 'reviewing' && row.status !== 'waiting_quote') {
    return {
      success: false,
      error: 'لا يمكن إسناد فني في الحالة الحالية',
    }
  }

  const { data: updated, error } = await supabase
    .from('maintenance_requests')
    .update({
      status: 'waiting_approval',
      assigned_to: parsed.data.technician_id,
      cost: parsed.data.cost ?? null,
    })
    .eq('id', parsed.data.request_id)
    .eq('building_id', buildingId)
    .eq('status', row.status)
    .select('id')
    .maybeSingle()

  if (error) return { success: false, error: 'تعذّر إسناد الفني' }
  if (!updated) {
    return {
      success: false,
      error: 'حالة الطلب تغيّرت — أعد المحاولة',
    }
  }

  revalidatePath('/maintenance')
  revalidatePath(`/maintenance/${parsed.data.request_id}`)
  return { success: true, message: 'تم إسناد الفني' }
}

// =============================================
// Save quote (reviewing -> waiting_quote, sets cost only — no technician yet)
// =============================================
export async function saveMaintenanceQuoteAction(
  formData: FormData,
): Promise<ActionResult> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensureManager(buildingId)
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = maintenanceQuoteSchema.safeParse({
    request_id: fdGet(formData, 'request_id'),
    cost: fdGet(formData, 'cost'),
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة' }
  }

  const supabase = await createClient()
  const { data: updated, error } = await supabase
    .from('maintenance_requests')
    .update({ status: 'waiting_quote', cost: parsed.data.cost })
    .eq('id', parsed.data.request_id)
    .eq('building_id', buildingId)
    .eq('status', 'reviewing')
    .select('id')
    .maybeSingle()

  if (error) return { success: false, error: 'تعذّر حفظ عرض السعر' }
  if (!updated) {
    return { success: false, error: 'الطلب ليس في حالة "قيد المراجعة"' }
  }

  revalidatePath(`/maintenance/${parsed.data.request_id}`)
  return { success: true, message: 'تم حفظ عرض السعر' }
}

// =============================================
// Approve and start work — admin/committee
// Accepts: waiting_approval -> in_progress (initial start)
//       OR reopened -> in_progress (resume after reopen)
// Trigger validates the transition; we restrict WHERE for friendly errors.
// =============================================
export async function startMaintenanceAction(
  requestId: string,
): Promise<ActionResult> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensureManager(buildingId)
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()
  const { data: updated, error } = await supabase
    .from('maintenance_requests')
    .update({ status: 'in_progress' })
    .eq('id', requestId)
    .eq('building_id', buildingId)
    .in('status', ['waiting_approval', 'reopened'])
    .select('id')
    .maybeSingle()

  if (error) return { success: false, error: 'تعذّر بدء العمل' }
  if (!updated) {
    return {
      success: false,
      error: 'الطلب ليس جاهزاً لبدء العمل (يلزم بانتظار الاعتماد أو إعادة الفتح)',
    }
  }

  revalidatePath('/maintenance')
  revalidatePath(`/maintenance/${requestId}`)
  return { success: true, message: 'بدأ العمل على الطلب' }
}

// =============================================
// Reject (any reviewable -> rejected) — admin/committee
// =============================================
export async function rejectMaintenanceAction(
  requestId: string,
): Promise<ActionResult> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensureManager(buildingId)
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()
  const { data: updated, error } = await supabase
    .from('maintenance_requests')
    .update({ status: 'rejected' })
    .eq('id', requestId)
    .eq('building_id', buildingId)
    .in('status', ['new', 'reviewing', 'waiting_quote', 'waiting_approval'])
    .select('id')
    .maybeSingle()

  if (error) return { success: false, error: 'تعذّر رفض الطلب' }
  if (!updated) {
    return {
      success: false,
      error: 'لا يمكن رفض الطلب في حالته الحالية',
    }
  }

  revalidatePath('/maintenance')
  revalidatePath(`/maintenance/${requestId}`)
  return { success: true, message: 'تم رفض الطلب' }
}

// =============================================
// Complete (in_progress -> completed) — assignee or admin
// after_image is MANDATORY (proof of work)
// =============================================
export async function completeMaintenanceAction(
  formData: FormData,
): Promise<ActionResult> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensureAuth()
  if (!auth.ok) return { success: false, error: auth.error }

  const requestId = fdGet(formData, 'request_id')
  if (!requestId) return { success: false, error: 'معرّف الطلب مفقود' }

  const file = formData.get('after_image')
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: 'صورة "بعد" مطلوبة لإثبات الإنجاز' }
  }
  const v = validateMaintenanceImage(file)
  if (!v.ok) return { success: false, error: v.error }

  const supabase = await createClient()

  // Upload first; storage RLS guards membership. Trigger validates assignee/admin
  // when the row UPDATE runs.
  const up = await uploadMaintenanceImage(supabase, {
    buildingId,
    requestId,
    kind: 'after',
    file,
  })
  if (!up.ok) return { success: false, error: up.error }

  const { data: updated, error } = await supabase
    .from('maintenance_requests')
    .update({
      status: 'completed',
      after_image_url: up.data.path,
      // completed_at auto-stamped by trigger.
    })
    .eq('id', requestId)
    .eq('building_id', buildingId)
    .eq('status', 'in_progress')
    .select('id')
    .maybeSingle()

  if (error) {
    await deleteMaintenanceImage(supabase, up.data.path)
    return { success: false, error: 'تعذّر إغلاق الطلب' }
  }
  if (!updated) {
    await deleteMaintenanceImage(supabase, up.data.path)
    return { success: false, error: 'الطلب ليس قيد التنفيذ' }
  }

  revalidatePath('/maintenance')
  revalidatePath(`/maintenance/${requestId}`)
  return { success: true, message: 'تم إغلاق الطلب' }
}

// =============================================
// Reopen — admin/committee (completed -> reopened) or assignee escalation (in_progress -> reopened)
// =============================================
export async function reopenMaintenanceAction(
  requestId: string,
): Promise<ActionResult> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensureAuth()
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()
  const { data: updated, error } = await supabase
    .from('maintenance_requests')
    .update({ status: 'reopened' })
    .eq('id', requestId)
    .eq('building_id', buildingId)
    .in('status', ['in_progress', 'completed'])
    .select('id')
    .maybeSingle()

  if (error) return { success: false, error: 'تعذّر إعادة فتح الطلب' }
  if (!updated) {
    return {
      success: false,
      error: 'لا يمكن إعادة فتح الطلب في حالته الحالية',
    }
  }

  revalidatePath('/maintenance')
  revalidatePath(`/maintenance/${requestId}`)
  return { success: true, message: 'تم إعادة فتح الطلب' }
}

// =============================================
// Link to expense — atomic RPC (Codex round 2 P2)
// =============================================
// Calls public.link_maintenance_to_expense(p_request_id) which:
//   1) FOR UPDATE locks the maintenance_request row
//   2) verifies caller is admin/committee
//   3) verifies related_expense_id IS NULL
//   4) INSERTs the draft expense
//   5) UPDATEs related_expense_id
// All in one transaction → no race-induced double-creates, no orphaned drafts.
// =============================================
export async function linkMaintenanceToExpenseAction(
  formData: FormData,
): Promise<ActionResult<{ expense_id: string }>> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensureManager(buildingId)
  if (!auth.ok) return { success: false, error: auth.error }

  const requestId = fdGet(formData, 'request_id')
  if (!requestId) return { success: false, error: 'معرّف الطلب مفقود' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .rpc('link_maintenance_to_expense', { p_request_id: requestId })

  if (error) {
    // Map Postgres custom errcodes (P0001..P0006) to user-readable messages.
    // We avoid relying on `code` exclusively because the message is more stable.
    const msg = (error.message || '').toLowerCase()
    if (msg.includes('not found')) {
      return { success: false, error: 'الطلب غير موجود' }
    }
    if (msg.includes('access denied')) {
      return { success: false, error: 'هذه العملية لمدير العمارة أو اللجنة' }
    }
    if (msg.includes('already linked')) {
      return { success: false, error: 'الطلب مرتبط بمصروف بالفعل' }
    }
    if (msg.includes('cannot create expense from request')) {
      return {
        success: false,
        error: 'لا يمكن إنشاء مصروف من طلب جديد أو مرفوض',
      }
    }
    if (msg.includes('concurrent link')) {
      return { success: false, error: 'حدث ربط متزامن — أعد المحاولة' }
    }
    return { success: false, error: 'تعذّر إنشاء المصروف وربطه' }
  }

  const expenseId = data as unknown as string
  revalidatePath('/maintenance')
  revalidatePath(`/maintenance/${requestId}`)
  revalidatePath('/expenses')
  return {
    success: true,
    data: { expense_id: expenseId },
    message: 'تم إنشاء مصروف مسودّة وربطه بالطلب',
  }
}
