'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/permissions'
import type {
  SubscriptionPlan,
  SubscriptionStatus,
} from '@/types/database'

type ActionResult = { success: true; message?: string } | { success: false; error: string }

const updateSubscriptionSchema = z.object({
  building_id: z.string().uuid(),
  plan: z.enum(['trial', 'basic', 'pro', 'enterprise']),
  status: z.enum(['trial', 'active', 'past_due', 'cancelled', 'expired']),
  trial_ends_at: z.string().optional().or(z.literal('')),
  subscription_ends_at: z.string().optional().or(z.literal('')),
})

function fdGet(form: FormData, key: string): string | undefined {
  const v = form.get(key)
  return typeof v === 'string' ? v : undefined
}

async function ensureSuperAdmin(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'يجب تسجيل الدخول' }
  if (!(await isSuperAdmin(user.id))) {
    return { ok: false, error: 'هذه العملية لـ super_admin فقط' }
  }
  return { ok: true, userId: user.id }
}

// =============================================
// Update building subscription via SECURITY DEFINER RPC
// =============================================
// All sanity checks (super_admin role + transition whitelist + audit field
// immutability) live in 16_phase14.sql. The action is a thin wrapper that
// adds the auth check + zod validation + Arabic error mapping.
// =============================================
export async function updateBuildingSubscriptionAction(
  formData: FormData,
): Promise<ActionResult> {
  const auth = await ensureSuperAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = updateSubscriptionSchema.safeParse({
    building_id: fdGet(formData, 'building_id'),
    plan: fdGet(formData, 'plan'),
    status: fdGet(formData, 'status'),
    trial_ends_at: fdGet(formData, 'trial_ends_at') ?? '',
    subscription_ends_at: fdGet(formData, 'subscription_ends_at') ?? '',
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('update_building_subscription', {
    p_building_id: parsed.data.building_id,
    p_plan: parsed.data.plan as SubscriptionPlan,
    p_status: parsed.data.status as SubscriptionStatus,
    p_trial_ends_at: parsed.data.trial_ends_at || null,
    p_subscription_ends_at: parsed.data.subscription_ends_at || null,
  })

  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('access denied')) return { success: false, error: 'super_admin only' }
    if (msg.includes('building not found')) return { success: false, error: 'العمارة غير موجودة' }
    if (msg.includes('invalid subscription_status transition')) {
      return { success: false, error: 'انتقال حالة الاشتراك غير صالح' }
    }
    return { success: false, error: 'تعذّر تحديث الاشتراك' }
  }

  revalidatePath('/super-admin')
  revalidatePath(`/super-admin/buildings/${parsed.data.building_id}`)
  revalidatePath('/super-admin/buildings')
  return { success: true, message: 'تم تحديث الاشتراك' }
}

// =============================================
// Quick-action wrappers used by the building detail page
// =============================================

export async function extendTrialAction(
  buildingId: string,
  daysToAdd: number,
): Promise<ActionResult> {
  const auth = await ensureSuperAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()
  const { data: building } = await supabase
    .from('buildings')
    .select('subscription_status, trial_ends_at')
    .eq('id', buildingId)
    .maybeSingle()
  if (!building) return { success: false, error: 'العمارة غير موجودة' }
  if (building.subscription_status !== 'trial') {
    return { success: false, error: 'لا يمكن تمديد فترة تجربة لعمارة ليست في trial' }
  }

  const base = building.trial_ends_at ? new Date(building.trial_ends_at) : new Date()
  const newDate = new Date(base.getTime() + daysToAdd * 24 * 60 * 60 * 1000)

  const { error } = await supabase.rpc('update_building_subscription', {
    p_building_id: buildingId,
    p_plan: 'trial' as SubscriptionPlan,
    p_status: 'trial' as SubscriptionStatus,
    p_trial_ends_at: newDate.toISOString(),
    p_subscription_ends_at: null,
  })
  if (error) return { success: false, error: 'تعذّر تمديد التجربة' }

  revalidatePath(`/super-admin/buildings/${buildingId}`)
  return { success: true, message: `تم تمديد التجربة ${daysToAdd} يوماً` }
}

export async function expireBuildingAction(buildingId: string): Promise<ActionResult> {
  const auth = await ensureSuperAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()
  const { data: building } = await supabase
    .from('buildings')
    .select('subscription_status, subscription_plan, trial_ends_at')
    .eq('id', buildingId)
    .maybeSingle()
  if (!building) return { success: false, error: 'العمارة غير موجودة' }

  const { error } = await supabase.rpc('update_building_subscription', {
    p_building_id: buildingId,
    p_plan: building.subscription_plan,
    p_status: 'expired' as SubscriptionStatus,
    p_trial_ends_at: building.trial_ends_at,
    p_subscription_ends_at: new Date().toISOString(),
  })
  if (error) {
    if (error.message.toLowerCase().includes('invalid subscription_status transition')) {
      return { success: false, error: 'لا يمكن تعطيل العمارة من حالتها الحالية' }
    }
    return { success: false, error: 'تعذّر تعطيل العمارة' }
  }

  revalidatePath(`/super-admin/buildings/${buildingId}`)
  revalidatePath('/super-admin/buildings')
  return { success: true, message: 'تم تعطيل العمارة' }
}

export async function reactivateBuildingAction(buildingId: string): Promise<ActionResult> {
  const auth = await ensureSuperAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()
  const { data: building } = await supabase
    .from('buildings')
    .select('subscription_plan, trial_ends_at')
    .eq('id', buildingId)
    .maybeSingle()
  if (!building) return { success: false, error: 'العمارة غير موجودة' }

  const { error } = await supabase.rpc('update_building_subscription', {
    p_building_id: buildingId,
    p_plan: building.subscription_plan,
    p_status: 'active' as SubscriptionStatus,
    p_trial_ends_at: building.trial_ends_at,
    p_subscription_ends_at: null,
  })
  if (error) return { success: false, error: 'تعذّر إعادة تفعيل العمارة' }

  revalidatePath(`/super-admin/buildings/${buildingId}`)
  return { success: true, message: 'تم إعادة تفعيل العمارة' }
}

// =============================================
// Phase 19 — changePlanAction (super_admin direct override, no order)
// =============================================
// For when super_admin works with the customer outside the /subscribe flow
// (phone/in-person agreement). Updates plan + optionally extends ends_at.
// Recorded in audit_logs via the buildings_update trigger.
//
// For in-flow renewals/upgrades, use createRenewalOrderAction instead.
// =============================================
const changePlanSchema = z.object({
  building_id: z.string().uuid(),
  new_tier_id: z.enum(['basic', 'pro', 'enterprise']),
  extend_cycle: z
    .enum(['monthly', 'yearly'])
    .nullable()
    .or(z.literal(''))
    .transform((v) => (v === '' || v === null ? null : v)),
  note: z.string().min(5, 'سبب التَغيير مطلوب').max(1000),
})

export async function changePlanAction(formData: FormData): Promise<ActionResult> {
  const auth = await ensureSuperAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = changePlanSchema.safeParse({
    building_id: fdGet(formData, 'building_id'),
    new_tier_id: fdGet(formData, 'new_tier_id'),
    extend_cycle: fdGet(formData, 'extend_cycle') ?? '',
    note: fdGet(formData, 'note'),
  })
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة',
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('change_subscription_plan', {
    p_building_id: parsed.data.building_id,
    p_new_tier_id: parsed.data.new_tier_id,
    p_extend_cycle: parsed.data.extend_cycle,
    p_note: parsed.data.note,
  })

  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('access denied')) {
      return { success: false, error: 'super_admin only' }
    }
    if (msg.includes('tier not available')) {
      return { success: false, error: 'الباقة غير متاحة' }
    }
    if (msg.includes('building not found')) {
      return { success: false, error: 'العمارة غير موجودة' }
    }
    if (msg.includes('note required')) {
      return { success: false, error: 'سبب التَغيير مطلوب (5 أحرف على الأقل)' }
    }
    return { success: false, error: 'تَعذَّر تَغيير الباقة' }
  }

  revalidatePath(`/super-admin/buildings/${parsed.data.building_id}`)
  revalidatePath('/super-admin/buildings')
  return {
    success: true,
    message: parsed.data.extend_cycle
      ? 'تم تَغيير الباقة وتَمديد الاشتراك'
      : 'تم تَغيير الباقة',
  }
}
