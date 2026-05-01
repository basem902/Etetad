'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId } from '@/lib/tenant'
import { hasRole, isSuperAdmin } from '@/lib/permissions'

type ActionResult = { success: true; message?: string } | { success: false; error: string }

function fdGet(form: FormData, key: string): string | undefined {
  const v = form.get(key)
  return typeof v === 'string' ? v : undefined
}

// =============================================
// Phase 22 — updateBuildingMetadataAction
// =============================================
// admin يُحَدِّث: name, address, city, total_apartments, elevators_count,
// default_monthly_fee. الـ DB-side RPC يَفرض admin role + length limits.
// =============================================
const buildingMetadataSchema = z.object({
  name: z.string().min(2).max(200),
  address: z.string().max(500).optional().or(z.literal('')),
  city: z.string().max(80).optional().or(z.literal('')),
  total_apartments: z.coerce.number().int().min(0).max(10000),
  elevators_count: z.coerce.number().int().min(0).max(100),
  default_monthly_fee: z.coerce.number().min(0),
})

export async function updateBuildingMetadataAction(
  formData: FormData,
): Promise<ActionResult> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'يجب تسجيل الدخول' }

  const allowed =
    (await isSuperAdmin(user.id)) ||
    (await hasRole(buildingId, ['admin'], user.id))
  if (!allowed) return { success: false, error: 'هذه العملية لمدير العمارة فقط' }

  const parsed = buildingMetadataSchema.safeParse({
    name: fdGet(formData, 'name') ?? '',
    address: fdGet(formData, 'address') ?? '',
    city: fdGet(formData, 'city') ?? '',
    total_apartments: fdGet(formData, 'total_apartments') ?? '0',
    elevators_count: fdGet(formData, 'elevators_count') ?? '0',
    default_monthly_fee: fdGet(formData, 'default_monthly_fee') ?? '0',
  })
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة',
    }
  }

  const { error: rpcErr } = await supabase.rpc('update_building_metadata', {
    p_building_id: buildingId,
    p_name: parsed.data.name,
    p_address: parsed.data.address || null,
    p_city: parsed.data.city || null,
    p_total_apartments: parsed.data.total_apartments,
    p_elevators_count: parsed.data.elevators_count,
    p_default_monthly_fee: parsed.data.default_monthly_fee,
  })

  if (rpcErr) {
    const msg = rpcErr.message?.toLowerCase() ?? ''
    if (msg.includes('access denied')) {
      return { success: false, error: 'هذه العملية لمدير العمارة فقط' }
    }
    return { success: false, error: 'تَعذَّر تَحديث بيانات العمارة' }
  }

  revalidatePath('/apartments')
  revalidatePath('/dashboard')
  return { success: true, message: 'تم تَحديث بيانات العمارة' }
}

// =============================================
// completeBuildingSetupAction — first-login wizard for new admins
// =============================================
// Called from /onboarding/setup. Updates building metadata + auto-creates
// apartment rows numbered 1..N, then marks setup_completed_at = now() so
// AppLayout stops redirecting to the wizard.
// =============================================
const buildingSetupSchema = z.object({
  building_id: z.string().uuid(),
  name: z.string().min(2).max(200),
  floors_count: z.coerce.number().int().min(1).max(200),
  total_apartments: z.coerce.number().int().min(1).max(10000),
  elevators_count: z.coerce.number().int().min(0).max(100),
})

export async function completeBuildingSetupAction(
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'يجب تسجيل الدخول' }

  const parsed = buildingSetupSchema.safeParse({
    building_id: fdGet(formData, 'building_id') ?? '',
    name: fdGet(formData, 'name') ?? '',
    floors_count: fdGet(formData, 'floors_count') ?? '0',
    total_apartments: fdGet(formData, 'total_apartments') ?? '0',
    elevators_count: fdGet(formData, 'elevators_count') ?? '0',
  })
  if (!parsed.success) {
    const issue = parsed.error.errors[0]
    let msg = issue?.message ?? 'بيانات غير صالحة'
    if (issue?.path[0] === 'floors_count') msg = 'عَدَد الأَدوار يَجِب أن يَكون 1 على الأَقَل'
    else if (issue?.path[0] === 'total_apartments') msg = 'عَدَد الشُقَق يَجِب أن يَكون 1 على الأَقَل'
    else if (issue?.path[0] === 'elevators_count') msg = 'عَدَد المَصاعد يَجِب أن يَكون 0 أو أَكثَر'
    return { success: false, error: msg }
  }

  const allowed =
    (await isSuperAdmin(user.id)) ||
    (await hasRole(parsed.data.building_id, ['admin'], user.id))
  if (!allowed) return { success: false, error: 'هذه العملية لمدير العمارة فقط' }

  const { error: rpcErr } = await supabase.rpc('complete_building_setup', {
    p_building_id: parsed.data.building_id,
    p_name: parsed.data.name,
    p_floors_count: parsed.data.floors_count,
    p_total_apartments: parsed.data.total_apartments,
    p_elevators_count: parsed.data.elevators_count,
  })

  if (rpcErr) {
    const msg = rpcErr.message?.toLowerCase() ?? ''
    if (msg.includes('access denied')) {
      return { success: false, error: 'هذه العملية لمدير العمارة فقط' }
    }
    if (msg.includes('already completed')) {
      return { success: false, error: 'تم إعداد العمارة مُسبَقاً' }
    }
    if (msg.includes('not found')) {
      return { success: false, error: 'العمارة غير مَوجودة' }
    }
    return { success: false, error: 'تَعذَّر إعداد العمارة. حاول مَرَّة أُخرى.' }
  }

  revalidatePath('/dashboard')
  revalidatePath('/apartments')
  return { success: true, message: 'تم إعداد العمارة بنَجاح.' }
}
