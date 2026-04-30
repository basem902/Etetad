'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId } from '@/lib/tenant'
import { hasRole, isSuperAdmin } from '@/lib/permissions'
import {
  vendorCreateSchema,
  vendorUpdateSchema,
} from '@/lib/validations/vendors'

type ActionResult<T = void> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

function fdGet(form: FormData, key: string): string | undefined {
  const v = form.get(key)
  return typeof v === 'string' ? v : undefined
}

async function ensureManager(
  buildingId: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'يجب تسجيل الدخول' }
  const allowed =
    (await isSuperAdmin(user.id)) ||
    (await hasRole(buildingId, ['admin', 'treasurer', 'committee'], user.id))
  if (!allowed) {
    return { ok: false, error: 'إدارة الموردين لمدير/أمين/لجنة العمارة فقط' }
  }
  return { ok: true, userId: user.id }
}

function parseRating(raw: string | undefined): number | null {
  if (!raw || raw.trim() === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  if (n < 0 || n > 5) return null
  return n
}

// =============================================
// Create vendor
// =============================================
export async function createVendorAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensureManager(buildingId)
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = vendorCreateSchema.safeParse({
    name: fdGet(formData, 'name'),
    phone: fdGet(formData, 'phone') ?? '',
    specialty: fdGet(formData, 'specialty') ?? '',
    rating: fdGet(formData, 'rating') ?? '',
    notes: fdGet(formData, 'notes') ?? '',
  })
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة',
    }
  }

  const supabase = await createClient()
  const vendorId = crypto.randomUUID()

  const { error } = await supabase.from('vendors').insert({
    id: vendorId,
    building_id: buildingId,
    name: parsed.data.name.trim(),
    phone: parsed.data.phone?.trim() || null,
    specialty: parsed.data.specialty?.trim() || null,
    rating: parseRating(fdGet(formData, 'rating')),
    notes: parsed.data.notes?.trim() || null,
    is_active: true,
  })

  if (error) {
    return { success: false, error: 'تعذّر إنشاء المورد' }
  }

  revalidatePath('/vendors')
  return { success: true, data: { id: vendorId }, message: 'تم إنشاء المورد' }
}

// =============================================
// Update vendor
// =============================================
export async function updateVendorAction(
  formData: FormData,
): Promise<ActionResult> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensureManager(buildingId)
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = vendorUpdateSchema.safeParse({
    vendor_id: fdGet(formData, 'vendor_id'),
    name: fdGet(formData, 'name'),
    phone: fdGet(formData, 'phone') ?? '',
    specialty: fdGet(formData, 'specialty') ?? '',
    rating: fdGet(formData, 'rating') ?? '',
    notes: fdGet(formData, 'notes') ?? '',
  })
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة',
    }
  }

  const supabase = await createClient()
  // Trigger blocks any building_id change defensively (Phase 8 lesson).
  const { data: updated, error } = await supabase
    .from('vendors')
    .update({
      name: parsed.data.name.trim(),
      phone: parsed.data.phone?.trim() || null,
      specialty: parsed.data.specialty?.trim() || null,
      rating: parseRating(fdGet(formData, 'rating')),
      notes: parsed.data.notes?.trim() || null,
    })
    .eq('id', parsed.data.vendor_id)
    .eq('building_id', buildingId)
    .select('id')
    .maybeSingle()

  if (error) return { success: false, error: 'تعذّر تحديث المورد' }
  if (!updated) {
    return { success: false, error: 'المورد غير موجود في هذه العمارة' }
  }

  revalidatePath('/vendors')
  revalidatePath(`/vendors/${parsed.data.vendor_id}`)
  return { success: true, message: 'تم حفظ التعديلات' }
}

// =============================================
// Toggle active (soft archive)
// =============================================
// Hard delete is supported by the schema (FK uses on delete set null), but the
// preferred flow is soft-archive via is_active=false to preserve vendor name in
// any historical references in the UI.
export async function toggleVendorActiveAction(
  vendorId: string,
  isActive: boolean,
): Promise<ActionResult> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensureManager(buildingId)
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()
  const { data: updated, error } = await supabase
    .from('vendors')
    .update({ is_active: isActive })
    .eq('id', vendorId)
    .eq('building_id', buildingId)
    .select('id')
    .maybeSingle()

  if (error) return { success: false, error: 'تعذّر تحديث الحالة' }
  if (!updated) {
    return { success: false, error: 'المورد غير موجود في هذه العمارة' }
  }

  revalidatePath('/vendors')
  revalidatePath(`/vendors/${vendorId}`)
  return {
    success: true,
    message: isActive ? 'تم تفعيل المورد' : 'تم أرشفة المورد',
  }
}
