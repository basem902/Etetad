'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId } from '@/lib/tenant'
import { hasRole, isSuperAdmin } from '@/lib/permissions'
import {
  suggestionCreateSchema,
  suggestionUpdateSchema,
  suggestionStatusSchema,
  voteCreateSchema,
  castVoteSchema,
  decisionCreateSchema,
} from '@/lib/validations/governance'
import type { ApprovalRule } from '@/types/database'

type ActionResult<T = void> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

function fdGet(form: FormData, key: string): string | undefined {
  const v = form.get(key)
  return typeof v === 'string' ? v : undefined
}

function fdGetAll(form: FormData, key: string): string[] {
  return form.getAll(key).filter((v): v is string => typeof v === 'string')
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
// Suggestions
// =============================================

export async function createSuggestionAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensureAuth()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = suggestionCreateSchema.safeParse({
    title: fdGet(formData, 'title'),
    description: fdGet(formData, 'description') ?? '',
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة' }
  }

  const supabase = await createClient()
  const id = crypto.randomUUID()
  const { error } = await supabase.from('suggestions').insert({
    id,
    building_id: buildingId,
    title: parsed.data.title.trim(),
    description: parsed.data.description?.trim() || null,
    created_by: auth.userId,
    status: 'new',
  })
  if (error) return { success: false, error: 'تعذّر إنشاء الاقتراح' }

  revalidatePath('/suggestions')
  return { success: true, data: { id }, message: 'تم تسجيل الاقتراح' }
}

export async function updateSuggestionAction(
  formData: FormData,
): Promise<ActionResult> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensureAuth()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = suggestionUpdateSchema.safeParse({
    suggestion_id: fdGet(formData, 'suggestion_id'),
    title: fdGet(formData, 'title'),
    description: fdGet(formData, 'description') ?? '',
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة' }
  }

  const supabase = await createClient()
  // Only allow editing in non-terminal states. RLS additionally restricts to author or admin.
  const { data: updated, error } = await supabase
    .from('suggestions')
    .update({
      title: parsed.data.title.trim(),
      description: parsed.data.description?.trim() || null,
    })
    .eq('id', parsed.data.suggestion_id)
    .eq('building_id', buildingId)
    .in('status', ['new', 'discussion', 'pricing'])
    .select('id')
    .maybeSingle()

  if (error) return { success: false, error: 'تعذّر تحديث الاقتراح' }
  if (!updated) {
    return {
      success: false,
      error: 'لا يمكن تعديل الاقتراح في حالته الحالية',
    }
  }

  revalidatePath('/suggestions')
  revalidatePath(`/suggestions/${parsed.data.suggestion_id}`)
  return { success: true, message: 'تم حفظ التعديلات' }
}

export async function changeSuggestionStatusAction(
  formData: FormData,
): Promise<ActionResult> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensureManager(buildingId)
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = suggestionStatusSchema.safeParse({
    suggestion_id: fdGet(formData, 'suggestion_id'),
    status: fdGet(formData, 'status'),
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة' }
  }

  const supabase = await createClient()
  const { data: updated, error } = await supabase
    .from('suggestions')
    .update({ status: parsed.data.status })
    .eq('id', parsed.data.suggestion_id)
    .eq('building_id', buildingId)
    .select('id')
    .maybeSingle()

  if (error) {
    if (error.message.toLowerCase().includes('invalid suggestion status transition')) {
      return { success: false, error: 'انتقال الحالة غير صالح' }
    }
    return { success: false, error: 'تعذّر تحديث الحالة' }
  }
  if (!updated) {
    return { success: false, error: 'الاقتراح غير موجود' }
  }

  revalidatePath('/suggestions')
  revalidatePath(`/suggestions/${parsed.data.suggestion_id}`)
  return { success: true, message: 'تم تحديث الحالة' }
}

// =============================================
// Votes
// =============================================

/**
 * Create a vote, optionally from a suggestion. Calls convert_suggestion_to_vote
 * RPC when suggestion_id is set (atomic conversion + status flip), or builds
 * the vote+options manually otherwise.
 */
export async function createVoteAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensureManager(buildingId)
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = voteCreateSchema.safeParse({
    suggestion_id: fdGet(formData, 'suggestion_id') ?? '',
    title: fdGet(formData, 'title'),
    description: fdGet(formData, 'description') ?? '',
    options: fdGetAll(formData, 'options').filter((s) => s.trim()),
    ends_at: fdGet(formData, 'ends_at'),
    approval_rule: fdGet(formData, 'approval_rule'),
    custom_threshold: fdGet(formData, 'custom_threshold'),
    estimated_cost: fdGet(formData, 'estimated_cost'),
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة' }
  }

  const supabase = await createClient()

  // Atomic path: convert from suggestion via RPC
  if (parsed.data.suggestion_id && parsed.data.suggestion_id.trim() !== '') {
    const { data, error } = await supabase.rpc('convert_suggestion_to_vote', {
      p_suggestion_id: parsed.data.suggestion_id,
      p_title: parsed.data.title.trim(),
      p_description: parsed.data.description?.trim() || null,
      p_options: parsed.data.options.map((o) => o.trim()).filter(Boolean),
      p_ends_at: parsed.data.ends_at,
      p_approval_rule: parsed.data.approval_rule as ApprovalRule,
      p_custom_threshold: parsed.data.custom_threshold ?? null,
      p_estimated_cost: parsed.data.estimated_cost ?? null,
    })
    if (error) {
      const msg = error.message.toLowerCase()
      if (msg.includes('access denied')) return { success: false, error: 'هذه العملية لمدير العمارة أو اللجنة' }
      if (msg.includes('not found')) return { success: false, error: 'الاقتراح غير موجود' }
      if (msg.includes('cannot be converted')) return { success: false, error: 'الاقتراح في حالة لا تَقبل التحويل' }
      if (msg.includes('at least 2 options')) return { success: false, error: 'يلزم خياران على الأقل' }
      if (msg.includes('ends_at must be in the future')) return { success: false, error: 'تاريخ الإغلاق يجب أن يكون في المستقبل' }
      return { success: false, error: 'تعذّر تحويل الاقتراح إلى تصويت' }
    }
    const id = data as unknown as string
    revalidatePath('/votes')
    revalidatePath('/suggestions')
    return { success: true, data: { id }, message: 'تم تحويل الاقتراح إلى تصويت' }
  }

  // Standalone path: SECURITY DEFINER RPC ensures atomicity (Codex round 2 P2).
  // Previously we did insert vote + insert options + on-failure delete vote,
  // but no DELETE policy on votes meant cleanup silently failed on errors.
  const { data: standaloneId, error: rpcErr } = await supabase.rpc(
    'create_vote_with_options',
    {
      p_building_id: buildingId,
      p_title: parsed.data.title.trim(),
      p_description: parsed.data.description?.trim() || null,
      p_options: parsed.data.options.map((o) => o.trim()).filter(Boolean),
      p_ends_at: parsed.data.ends_at,
      p_approval_rule: parsed.data.approval_rule as ApprovalRule,
      p_custom_threshold: parsed.data.custom_threshold ?? null,
      p_estimated_cost: parsed.data.estimated_cost ?? null,
    },
  )
  if (rpcErr) {
    const msg = rpcErr.message.toLowerCase()
    if (msg.includes('access denied')) return { success: false, error: 'هذه العملية لمدير العمارة أو اللجنة' }
    if (msg.includes('at least 2 options')) return { success: false, error: 'يلزم خياران على الأقل' }
    if (msg.includes('ends_at must be in the future')) return { success: false, error: 'تاريخ الإغلاق يجب أن يكون في المستقبل' }
    if (msg.includes('custom_threshold must be in')) return { success: false, error: 'النسبة المخصَّصة يجب أن تكون بين 0 و1' }
    return { success: false, error: 'تعذّر إنشاء التصويت' }
  }

  revalidatePath('/votes')
  return {
    success: true,
    data: { id: standaloneId as unknown as string },
    message: 'تم إنشاء التصويت كمسودّة',
  }
}

async function callVoteRpc(
  fnName: 'activate_vote' | 'close_vote' | 'cancel_vote',
  voteId: string,
  successMessage: string,
): Promise<ActionResult> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const supabase = await createClient()
  const { error } = await supabase.rpc(fnName, { p_vote_id: voteId })
  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('access denied')) return { success: false, error: 'هذه العملية لمدير العمارة أو اللجنة' }
    if (msg.includes('not found')) return { success: false, error: 'التصويت غير موجود' }
    if (msg.includes('only draft votes can be activated'))
      return { success: false, error: 'فقط مسودّات التصويتات يمكن تفعيلها' }
    if (msg.includes('only active votes can be closed'))
      return { success: false, error: 'فقط التصويتات النشطة يمكن إغلاقها' }
    if (msg.includes('only draft or active votes can be cancelled'))
      return { success: false, error: 'فقط المسودّات أو النشطة يمكن إلغاؤها' }
    if (msg.includes('needs at least 2 options'))
      return { success: false, error: 'يلزم خياران على الأقل قبل التفعيل' }
    if (msg.includes('ends_at must be in the future'))
      return { success: false, error: 'تاريخ الإغلاق يجب أن يكون في المستقبل' }
    return { success: false, error: 'تعذّر تنفيذ العملية' }
  }
  revalidatePath('/votes')
  revalidatePath(`/votes/${voteId}`)
  return { success: true, message: successMessage }
}

export async function activateVoteAction(voteId: string): Promise<ActionResult> {
  return callVoteRpc('activate_vote', voteId, 'تم تفعيل التصويت')
}

export async function closeVoteAction(voteId: string): Promise<ActionResult> {
  return callVoteRpc('close_vote', voteId, 'تم إغلاق التصويت')
}

export async function cancelVoteAction(voteId: string): Promise<ActionResult> {
  return callVoteRpc('cancel_vote', voteId, 'تم إلغاء التصويت')
}

/** Cast a vote via the SECURITY DEFINER RPC (atomic + race-safe). */
export async function castVoteAction(formData: FormData): Promise<ActionResult> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const parsed = castVoteSchema.safeParse({
    vote_id: fdGet(formData, 'vote_id'),
    apartment_id: fdGet(formData, 'apartment_id'),
    option_id: fdGet(formData, 'option_id'),
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('cast_vote_for_apartment', {
    p_vote_id: parsed.data.vote_id,
    p_apartment_id: parsed.data.apartment_id,
    p_option_id: parsed.data.option_id,
  })

  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('vote is not active')) return { success: false, error: 'التصويت ليس نشطاً' }
    if (msg.includes('outside its open window')) return { success: false, error: 'انتهى وقت التصويت' }
    if (msg.includes('not in the same building')) return { success: false, error: 'الشقة ليست في نفس عمارة التصويت' }
    if (msg.includes('not the voting representative')) return { success: false, error: 'لست ممثل التصويت لهذه الشقة' }
    if (msg.includes('option does not belong')) return { success: false, error: 'الخيار غير صالح لهذا التصويت' }
    if (msg.includes('already voted')) return { success: false, error: 'الشقة صوّتت بالفعل على هذا التصويت' }
    if (msg.includes('uq_vote_per_apartment')) return { success: false, error: 'الشقة صوّتت بالفعل على هذا التصويت' }
    return { success: false, error: 'تعذّر تسجيل الصوت' }
  }

  revalidatePath('/votes')
  revalidatePath(`/votes/${parsed.data.vote_id}`)
  return { success: true, message: 'تم تسجيل صوتك' }
}

// =============================================
// Decisions
// =============================================

export async function createDecisionAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensureManager(buildingId)
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = decisionCreateSchema.safeParse({
    vote_id: fdGet(formData, 'vote_id') ?? '',
    title: fdGet(formData, 'title'),
    description: fdGet(formData, 'description') ?? '',
    status: fdGet(formData, 'status'),
    decision_date: fdGet(formData, 'decision_date') ?? '',
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة' }
  }

  const supabase = await createClient()

  // If vote_id is set, verify it belongs to this building (defensive — RLS also enforces)
  if (parsed.data.vote_id && parsed.data.vote_id.trim() !== '') {
    const { data: vote } = await supabase
      .from('votes')
      .select('id, building_id, status')
      .eq('id', parsed.data.vote_id)
      .maybeSingle()
    if (!vote || vote.building_id !== buildingId) {
      return { success: false, error: 'التصويت غير موجود في هذه العمارة' }
    }
    if (vote.status !== 'closed') {
      return { success: false, error: 'لا يمكن إنشاء قرار من تصويت غير مُغلق' }
    }
  }

  const id = crypto.randomUUID()
  const { error } = await supabase.from('decisions').insert({
    id,
    building_id: buildingId,
    title: parsed.data.title.trim(),
    description: parsed.data.description?.trim() || null,
    vote_id: parsed.data.vote_id || null,
    status: parsed.data.status,
    decision_date: parsed.data.decision_date || new Date().toISOString().slice(0, 10),
    created_by: auth.userId,
  })
  if (error) return { success: false, error: 'تعذّر تسجيل القرار' }

  revalidatePath('/decisions')
  return { success: true, data: { id }, message: 'تم تسجيل القرار' }
}
