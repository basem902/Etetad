'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAuthAdmin } from '@/lib/supabase/auth-admin'
import { getActiveBuildingId } from '@/lib/tenant'
import { hasRole, isSuperAdmin } from '@/lib/permissions'
import type { MembershipRole } from '@/types/database'
import {
  addTeamMemberSchema,
  deactivateTeamMemberSchema,
} from '@/lib/validations/team'

type ActionResult<T = void> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

function fdGet(form: FormData, key: string): string | undefined {
  const v = form.get(key)
  return typeof v === 'string' ? v : undefined
}

async function ensureAdmin(
  buildingId: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'يجب تسجيل الدخول' }

  const allowed =
    (await isSuperAdmin(user.id)) || (await hasRole(buildingId, ['admin'], user.id))
  if (!allowed) return { ok: false, error: 'هذه العملية لمدير العمارة فقط' }

  return { ok: true, userId: user.id }
}

// ============================================================================
// Phase 19 — /team
// Add/deactivate non-apartment-bound roles: treasurer, committee, technician.
// admin role uses super-admin path; resident role uses apartments + join links.
// ============================================================================

export async function addTeamMemberAction(
  formData: FormData,
): Promise<ActionResult<{ id: string; invited: boolean }>> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensureAdmin(buildingId)
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = addTeamMemberSchema.safeParse({
    email: fdGet(formData, 'email'),
    full_name: fdGet(formData, 'full_name') || '',
    role: fdGet(formData, 'role'),
  })
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة',
    }
  }

  const { email, full_name, role } = parsed.data
  const authAdmin = getAuthAdmin()
  const supabase = await createClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  // 1) Lookup user by email (paginate listUsers).
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

  // 2) Invite if missing.
  if (!userId) {
    const { data: inviteData, error: inviteErr } =
      await authAdmin.inviteUserByEmail(email, {
        data: full_name ? { full_name } : undefined,
        redirectTo: `${appUrl}/auth/callback?next=/dashboard`,
      })
    if (inviteErr || !inviteData.user) {
      return { success: false, error: 'تعذّر إرسال الدعوة' }
    }
    userId = inviteData.user.id
    invited = true
  }

  // 3) Add membership via RPC (audited as the admin caller).
  const { data: membershipId, error: rpcErr } = await supabase.rpc(
    'add_team_member',
    {
      p_building_id: buildingId,
      p_user_id: userId,
      p_role: role,
    },
  )

  if (rpcErr) {
    if (rpcErr.message?.toLowerCase().includes('already has active membership')) {
      return {
        success: false,
        error: 'هذا الشخص مرتبط بالفعل بالعمارة',
      }
    }
    if (rpcErr.message?.toLowerCase().includes('access denied')) {
      return { success: false, error: 'هذه العملية لمدير العمارة فقط' }
    }
    return { success: false, error: 'تعذّر إضافة العضو إلى الفريق' }
  }

  revalidatePath('/team')
  return {
    success: true,
    data: { id: String(membershipId ?? ''), invited },
    message: invited
      ? 'تم إرسال الدعوة وإضافة العضو إلى الفريق'
      : 'تم إضافة العضو إلى الفريق',
  }
}

export async function deactivateTeamMemberAction(
  formData: FormData,
): Promise<ActionResult> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensureAdmin(buildingId)
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = deactivateTeamMemberSchema.safeParse({
    membership_id: fdGet(formData, 'membership_id'),
  })
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة',
    }
  }

  const supabase = await createClient()
  const { error: rpcErr } = await supabase.rpc('deactivate_team_member', {
    p_membership_id: parsed.data.membership_id,
  })

  if (rpcErr) {
    const msg = rpcErr.message?.toLowerCase() ?? ''
    if (msg.includes('only manages treasurer/committee/technician')) {
      return {
        success: false,
        error:
          'مسار الفريق مَخصَّص لأمين الصندوق / اللجنة / الفني فقط. للساكن: استخدم صفحة الشقق. للمدير: لوحة المنصة.',
      }
    }
    if (msg.includes('access denied')) {
      return { success: false, error: 'هذه العملية لمدير العمارة فقط' }
    }
    if (msg.includes('not found')) {
      return { success: false, error: 'العضو غير موجود' }
    }
    return { success: false, error: 'تعذّر إزالة العضو' }
  }

  revalidatePath('/team')
  return { success: true, message: 'تم إزالة العضو من الفريق' }
}

// ============================================================================
// Phase 22 — change_member_role
// ============================================================================
// admin يُرَقِّي أو يُخَفِّض دَور أي عُضو في عمارته. يَحفظ apartment_members كما
// هي (لا يَكسر صَلة الساكن بشَقَّته). الـ DB-side RPC يَفرض last-admin
// protection.
// ============================================================================
const changeMemberRoleSchema = z.object({
  membership_id: z.string().uuid(),
  new_role: z.enum(['admin', 'treasurer', 'committee', 'resident', 'technician']),
})

export async function changeMemberRoleAction(
  formData: FormData,
): Promise<ActionResult> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensureAdmin(buildingId)
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = changeMemberRoleSchema.safeParse({
    membership_id: fdGet(formData, 'membership_id'),
    new_role: fdGet(formData, 'new_role'),
  })
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة',
    }
  }

  const supabase = await createClient()
  const { error: rpcErr } = await supabase.rpc('change_member_role', {
    p_membership_id: parsed.data.membership_id,
    p_new_role: parsed.data.new_role as MembershipRole,
  })

  if (rpcErr) {
    const msg = rpcErr.message?.toLowerCase() ?? ''
    if (msg.includes('cannot demote the last admin')) {
      return {
        success: false,
        error:
          'لا يُمكن إزالة آخر مدير. رَقِّ عضواً آخر إلى admin أولاً ثم أَعِد المُحاولة.',
      }
    }
    if (msg.includes('access denied')) {
      return { success: false, error: 'هذه العملية لمدير العمارة فقط' }
    }
    if (msg.includes('not found')) {
      return { success: false, error: 'العضو غير موجود' }
    }
    if (msg.includes('inactive membership')) {
      return { success: false, error: 'العضو غير نَشط — أَعِد تَفعيله أولاً' }
    }
    return { success: false, error: 'تَعذَّر تَغيير الدور' }
  }

  revalidatePath('/team')
  revalidatePath('/apartments')
  return { success: true, message: 'تم تَغيير الدور' }
}
