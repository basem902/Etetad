'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getAuthAdmin } from '@/lib/supabase/auth-admin'
import { getActiveBuildingId } from '@/lib/tenant'
import { hasRole, isSuperAdmin } from '@/lib/permissions'
import {
  apartmentSchema,
  linkMemberSchema,
  changeVotingRepSchema,
  deactivateMemberSchema,
} from '@/lib/validations/apartments'

type ActionResult<T = void> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

function fdGet(form: FormData, key: string): string | undefined {
  const v = form.get(key)
  return typeof v === 'string' ? v : undefined
}

async function ensureAdmin(buildingId: string): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'يجب تسجيل الدخول' }

  const allowed = (await isSuperAdmin(user.id)) || (await hasRole(buildingId, ['admin'], user.id))
  if (!allowed) return { ok: false, error: 'هذه العملية لمدير العمارة فقط' }

  return { ok: true, userId: user.id }
}

// ============================================================================
// Apartments CRUD
// ============================================================================

export async function createApartmentAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensureAdmin(buildingId)
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = apartmentSchema.safeParse({
    number: fdGet(formData, 'number'),
    floor: fdGet(formData, 'floor') || null,
    monthly_fee: fdGet(formData, 'monthly_fee') ?? 0,
    status: fdGet(formData, 'status') ?? 'vacant',
    notes: fdGet(formData, 'notes') || null,
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('apartments')
    .insert({
      building_id: buildingId,
      number: parsed.data.number,
      floor: parsed.data.floor ?? null,
      monthly_fee: parsed.data.monthly_fee,
      status: parsed.data.status,
      notes: parsed.data.notes ?? null,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'رقم الشقة موجود مسبقاً في هذه العمارة' }
    }
    return { success: false, error: 'تعذّر إنشاء الشقة' }
  }

  revalidatePath('/apartments')
  return { success: true, data: { id: data.id }, message: 'تم إنشاء الشقة' }
}

export async function updateApartmentAction(
  apartmentId: string,
  formData: FormData,
): Promise<ActionResult> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensureAdmin(buildingId)
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = apartmentSchema.safeParse({
    number: fdGet(formData, 'number'),
    floor: fdGet(formData, 'floor') || null,
    monthly_fee: fdGet(formData, 'monthly_fee') ?? 0,
    status: fdGet(formData, 'status') ?? 'vacant',
    notes: fdGet(formData, 'notes') || null,
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('apartments')
    .update({
      number: parsed.data.number,
      floor: parsed.data.floor ?? null,
      monthly_fee: parsed.data.monthly_fee,
      status: parsed.data.status,
      notes: parsed.data.notes ?? null,
    })
    .eq('id', apartmentId)
    .eq('building_id', buildingId)

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'رقم الشقة موجود مسبقاً في هذه العمارة' }
    }
    return { success: false, error: 'تعذّر تحديث الشقة' }
  }

  revalidatePath('/apartments')
  revalidatePath(`/apartments/${apartmentId}`)
  return { success: true, message: 'تم تحديث الشقة' }
}

// ============================================================================
// Members management
// ============================================================================

/**
 * Link an existing user (by email) to an apartment, or invite a new user.
 *
 * Uses `getAuthAdmin()` (PLAN §2.3 amendment): a narrow wrapper that exposes
 * ONLY the `auth.admin` surface (no `from()`/`rpc()`/`storage`). This is the
 * only way to call Supabase's invite/lookup-by-email APIs.
 * The actual `apartment_member` insert goes through the regular
 * `link_apartment_member` RPC under the caller's session (admin), so audit_logs
 * record the admin as actor.
 */
export async function linkOrInviteMemberAction(
  formData: FormData,
): Promise<ActionResult> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensureAdmin(buildingId)
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = linkMemberSchema.safeParse({
    apartment_id: fdGet(formData, 'apartment_id'),
    email: fdGet(formData, 'email'),
    full_name: fdGet(formData, 'full_name') ?? '',
    relation_type: fdGet(formData, 'relation_type'),
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة' }
  }

  const { apartment_id, email, full_name, relation_type } = parsed.data
  const authAdmin = getAuthAdmin()
  const supabase = await createClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  // 1) Look up user by email. Supabase has no server-side email filter on
  //    listUsers, so we paginate; cap kept reasonable for typical accounts.
  let userId: string | null = null
  let invited = false

  let page = 1
  const perPage = 200
  while (page <= 5) {
    const res = await authAdmin.listUsers({ page, perPage })
    const list = res.data?.users ?? []
    const match = list.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (match) {
      userId = match.id
      break
    }
    if (list.length < perPage) break
    page++
  }

  // 2) If still missing, invite the user via auth.admin.
  if (!userId) {
    const { data: inviteData, error: inviteErr } = await authAdmin.inviteUserByEmail(
      email,
      {
        data: full_name ? { full_name } : undefined,
        redirectTo: `${appUrl}/auth/callback?next=/dashboard`,
      },
    )
    if (inviteErr || !inviteData.user) {
      return { success: false, error: 'تعذّر إرسال الدعوة' }
    }
    userId = inviteData.user.id
    invited = true
  }

  // 3) Link via RPC under the admin caller's session (so audit_logs records
  //    the actor as the admin, not as service_role / null).
  const { error: rpcErr } = await supabase.rpc('link_apartment_member', {
    p_apartment_id: apartment_id,
    p_user_id: userId,
    p_relation_type: relation_type,
  })

  if (rpcErr) {
    if (rpcErr.message.includes('duplicate key')) {
      return { success: false, error: 'هذا الشخص مرتبط بهذه الشقة بالفعل بنفس النوع' }
    }
    return { success: false, error: 'تعذّر ربط العضو بالشقة' }
  }

  revalidatePath(`/apartments/${apartment_id}`)
  revalidatePath('/apartments')
  return {
    success: true,
    message: invited ? 'تم إرسال الدعوة وربط الشخص بالشقة' : 'تم ربط الشخص بالشقة',
  }
}

export async function changeVotingRepAction(
  formData: FormData,
): Promise<ActionResult> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensureAdmin(buildingId)
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = changeVotingRepSchema.safeParse({
    apartment_id: fdGet(formData, 'apartment_id'),
    new_member_id: fdGet(formData, 'new_member_id'),
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('change_voting_representative', {
    p_apartment_id: parsed.data.apartment_id,
    p_new_member_id: parsed.data.new_member_id,
  })

  if (error) {
    return { success: false, error: error.message || 'تعذّر تغيير ممثل التصويت' }
  }

  revalidatePath(`/apartments/${parsed.data.apartment_id}`)
  revalidatePath('/apartments')
  return { success: true, message: 'تم تغيير ممثل التصويت' }
}

export async function deactivateMemberAction(
  apartmentId: string,
  formData: FormData,
): Promise<ActionResult> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensureAdmin(buildingId)
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = deactivateMemberSchema.safeParse({
    member_id: fdGet(formData, 'member_id'),
    replacement_member_id: fdGet(formData, 'replacement_member_id') || '',
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('deactivate_apartment_member', {
    p_member_id: parsed.data.member_id,
    p_replacement_member_id: parsed.data.replacement_member_id || null,
  })

  if (error) {
    if (error.message.includes('voting representative without specifying a replacement')) {
      return {
        success: false,
        error: 'لا يمكن إزالة ممثل التصويت دون اختيار بديل من أعضاء الشقة',
      }
    }
    return { success: false, error: error.message || 'تعذّر إزالة العضو' }
  }

  revalidatePath(`/apartments/${apartmentId}`)
  revalidatePath('/apartments')
  return { success: true, message: 'تمت إزالة العضو' }
}
