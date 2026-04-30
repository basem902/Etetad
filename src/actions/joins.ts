'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { generateRawToken, hashToken } from '@/lib/tokens'
import { isSuperAdmin, hasRole } from '@/lib/permissions'
import type { ApartmentRelation } from '@/types/database'

type ActionResult = { success: true; message?: string } | { success: false; error: string }
type ResolveResult =
  | {
      success: true
      buildingId: string
      buildingName: string
      city: string | null
    }
  | { success: false; error: string; errorCode?: string }
type CreateLinkResult =
  | { success: true; rawToken: string; shareUrl: string }
  | { success: false; error: string }

function fdGet(form: FormData, key: string): string | undefined {
  const v = form.get(key)
  return typeof v === 'string' ? v : undefined
}

type TokenErrorCode =
  | 'invalid'
  | 'expired'
  | 'disabled'
  | 'max_uses_reached'
  | 'building_inactive'

const TOKEN_ERROR_MAP: Record<TokenErrorCode, string> = {
  invalid: 'الرابط غير صالح. تَأكد من النسخ الصحيح.',
  expired: 'انتهت صلاحية الرابط. اطلب من إدارة العمارة رابطاً جديداً.',
  disabled: 'الرابط مُعطَّل. اطلب من إدارة العمارة رابطاً جديداً.',
  max_uses_reached: 'تم استنفاد الحد الأقصى لاستخدامات هذا الرابط.',
  building_inactive: 'العمارة غير نشطة حالياً. تَواصل مع إدارة العمارة.',
}

// =============================================
// resolveJoinTokenAction — anon callable, RPC-only path (no direct DB query)
// =============================================
// Used by /join/[token] page to render building info + signup form.
// Pattern (lesson #18 + #28): page never queries `building_join_links` directly.
// Always goes through RPC with internal validation.
//
// Rate limit: 20/IP/minute via in-memory limiter (Phase 17 keeps the same
// pattern as Phase 16; Upstash upgrade noted for production).
// =============================================
export async function resolveJoinTokenAction(
  rawToken: string,
): Promise<ResolveResult> {
  if (!rawToken || typeof rawToken !== 'string' || rawToken.length < 16) {
    return { success: false, error: TOKEN_ERROR_MAP.invalid, errorCode: 'invalid' }
  }

  const hdrs = await headers()
  const ip = getClientIp(hdrs) ?? 'unknown'
  const rl = checkRateLimit(`join:resolve:${ip}`, 20, 60 * 1000)
  if (!rl.success) {
    return { success: false, error: 'محاولات كثيرة. حاول لاحقاً.' }
  }

  const tokenHash = hashToken(rawToken)
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('resolve_building_join_token', {
    p_token_hash: tokenHash,
  })

  if (error || !data || data.length === 0) {
    return { success: false, error: TOKEN_ERROR_MAP.invalid, errorCode: 'invalid' }
  }

  const row = data[0]
  if (!row) {
    return { success: false, error: TOKEN_ERROR_MAP.invalid, errorCode: 'invalid' }
  }

  if (row.error_code) {
    const code = row.error_code as TokenErrorCode
    return {
      success: false,
      error: TOKEN_ERROR_MAP[code] ?? TOKEN_ERROR_MAP.invalid,
      errorCode: row.error_code,
    }
  }

  if (!row.building_id || !row.building_name) {
    return { success: false, error: TOKEN_ERROR_MAP.invalid, errorCode: 'invalid' }
  }

  return {
    success: true,
    buildingId: row.building_id,
    buildingName: row.building_name,
    city: row.city,
  }
}

// =============================================
// signupAndJoinAction — anon, signup + queue pending after email confirm
// =============================================
// Step 1 of the 2-step join flow:
//   - Re-validate token (defense)
//   - Call supabase.auth.signUp() with metadata carrying the join intent
//   - Supabase sends confirmation email with redirectTo /join/finalize
//   - User clicks email → /auth/callback → /join/finalize → step 2 (finalize)
//
// We DO NOT create the pending row here — the user must confirm email first.
// The pending row is created in finalizeJoinRequestAction once authenticated.
// =============================================
const signupSchema = z.object({
  raw_token: z.string().min(16).max(200),
  email: z.string().email().max(254),
  password: z.string().min(8).max(72),
  full_name: z.string().min(2).max(120),
  apartment_number: z.string().max(30).optional().or(z.literal('')),
  phone: z.string().max(40).optional().or(z.literal('')),
})

export async function signupAndJoinAction(
  formData: FormData,
): Promise<ActionResult> {
  const hdrs = await headers()
  const ip = getClientIp(hdrs) ?? 'unknown'
  const rl = checkRateLimit(`join:signup:${ip}`, 5, 60 * 60 * 1000)
  if (!rl.success) {
    return { success: false, error: 'محاولات كثيرة. حاول لاحقاً.' }
  }

  const parsed = signupSchema.safeParse({
    raw_token: fdGet(formData, 'raw_token') ?? '',
    email: fdGet(formData, 'email') ?? '',
    password: fdGet(formData, 'password') ?? '',
    full_name: fdGet(formData, 'full_name') ?? '',
    apartment_number: fdGet(formData, 'apartment_number') ?? '',
    phone: fdGet(formData, 'phone') ?? '',
  })
  if (!parsed.success) {
    return { success: false, error: 'البيانات غير صالحة. تَحقَّق وحاول مجدَّداً.' }
  }

  const data = parsed.data

  // Re-validate token (defense — even though /join/[token] page already
  // resolved it, the user could have tampered with the form)
  const resolveResult = await resolveJoinTokenAction(data.raw_token)
  if (!resolveResult.success) {
    return { success: false, error: resolveResult.error }
  }

  const supabase = await createClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  // signUp with metadata carrying the join context. The `pending_join_*`
  // fields land in user_metadata, readable by /join/finalize after the
  // email confirmation lands in /auth/callback.
  const { error } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      data: {
        full_name: data.full_name,
        pending_join_token: data.raw_token,
        pending_join_apartment_number: data.apartment_number || null,
        pending_join_phone: data.phone || null,
      },
      emailRedirectTo: `${appUrl}/auth/callback?next=/join/finalize`,
    },
  })

  if (error) {
    // Most common: "User already registered" — guide them to login + share with admin
    const msg = error.message.toLowerCase()
    if (msg.includes('already') || msg.includes('exists')) {
      return {
        success: false,
        error:
          'هذا البريد مُسجَّل سابقاً. سجِّل دخولك أولاً، ثم زُر الرابط مرة أخرى.',
      }
    }
    return { success: false, error: 'تَعذَّر إنشاء الحساب. حاول مجدَّداً.' }
  }

  return {
    success: true,
    message:
      'أرسلنا رابط تأكيد على بريدك. اضغطه لإكمال التسجيل، ثم انتظر تَفعيل إدارة العمارة.',
  }
}

// =============================================
// finalizeJoinRequestAction — authenticated user, post-signup callback
// =============================================
// Step 2: called from /join/finalize after the user clicks the email link.
// Reads pending_join_* from user_metadata, calls submit_join_request RPC
// (server-only via admin client), then clears the metadata.
// =============================================
export async function finalizeJoinRequestAction(): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'يجب تسجيل الدخول.' }

  const meta = user.user_metadata as Record<string, unknown> | null
  const rawToken =
    typeof meta?.pending_join_token === 'string' ? meta.pending_join_token : null
  const apartmentNumber =
    typeof meta?.pending_join_apartment_number === 'string'
      ? meta.pending_join_apartment_number
      : null
  const phone =
    typeof meta?.pending_join_phone === 'string' ? meta.pending_join_phone : null
  const fullName =
    typeof meta?.full_name === 'string' && meta.full_name.length >= 2
      ? meta.full_name
      : (user.email?.split('@')[0] ?? 'مستخدم')

  if (!rawToken) {
    return {
      success: false,
      error: 'لم نَجد بيانات الانضمام في حسابك. حاول الزيارة مَرة أخرى.',
    }
  }

  // submit_join_request is server-only (service_role). Use admin client
  // narrow scope: only this RPC + (later) clearing user_metadata.
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return {
      success: false,
      error: 'الخدمة غير مُكوَّنة بشكل صحيح. تواصل مع الإدارة.',
    }
  }

  const tokenHash = hashToken(rawToken)
  const { error } = await admin.rpc('submit_join_request', {
    p_user_id: user.id,
    p_token_hash: tokenHash,
    p_full_name: fullName,
    p_apartment_number: apartmentNumber || null,
    p_phone: phone || null,
  })

  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('duplicate') || msg.includes('unique')) {
      return {
        success: false,
        error:
          'سبق أن أرسلت طلب انضمام لهذه العمارة. انتظر مراجعة الإدارة.',
      }
    }
    if (msg.includes('disabled')) return { success: false, error: TOKEN_ERROR_MAP.disabled }
    if (msg.includes('expired')) return { success: false, error: TOKEN_ERROR_MAP.expired }
    if (msg.includes('max uses')) return { success: false, error: TOKEN_ERROR_MAP.max_uses_reached }
    if (msg.includes('inactive')) return { success: false, error: TOKEN_ERROR_MAP.building_inactive }
    return { success: false, error: 'تَعذَّر إرسال طلب الانضمام. حاول لاحقاً.' }
  }

  // Clear the pending_join_* metadata (best-effort; failure is non-fatal —
  // the row is in DB so the next visit just shows pending state).
  try {
    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...(meta ?? {}),
        pending_join_token: null,
        pending_join_apartment_number: null,
        pending_join_phone: null,
      },
    })
  } catch {
    // ignore — pending row is the source of truth
  }

  return {
    success: true,
    message: 'تم إرسال طلبك. ستَستلم بريداً عند موافقة الإدارة.',
  }
}

// =============================================
// createJoinLinkAction — admin only, generates raw token (shown ONCE)
// =============================================
// Returns the raw token + share URL to the admin UI. The DB stores only the
// hash — the raw token is displayed once with a "save it now" warning.
// =============================================
const createLinkSchema = z.object({
  building_id: z.string().uuid(),
  expires_in_days: z
    .union([z.string().regex(/^\d+$/), z.literal('')])
    .optional()
    .transform((v) => (v && v !== '' ? Number(v) : null))
    .refine((v) => v === null || (v >= 1 && v <= 365), {
      message: 'expires_in_days must be 1-365',
    }),
  max_uses: z
    .union([z.string().regex(/^\d+$/), z.literal('')])
    .optional()
    .transform((v) => (v && v !== '' ? Number(v) : null))
    .refine((v) => v === null || (v >= 1 && v <= 10_000), {
      message: 'max_uses must be 1-10000',
    }),
})

export async function createJoinLinkAction(
  formData: FormData,
): Promise<CreateLinkResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'يجب تسجيل الدخول.' }

  const parsed = createLinkSchema.safeParse({
    building_id: fdGet(formData, 'building_id'),
    expires_in_days: fdGet(formData, 'expires_in_days') ?? '',
    max_uses: fdGet(formData, 'max_uses') ?? '',
  })
  if (!parsed.success) {
    return { success: false, error: 'البيانات غير صالحة.' }
  }

  // Authorization: admin of THIS building or super_admin
  const allowed =
    (await isSuperAdmin(user.id)) ||
    (await hasRole(parsed.data.building_id, ['admin'], user.id))
  if (!allowed) return { success: false, error: 'هذه العملية لـ admin العمارة فقط.' }

  const rawToken = generateRawToken()
  const tokenHash = hashToken(rawToken)
  const expiresAt = parsed.data.expires_in_days
    ? new Date(Date.now() + parsed.data.expires_in_days * 24 * 60 * 60 * 1000).toISOString()
    : null

  const { error } = await supabase.rpc('create_building_join_link', {
    p_building_id: parsed.data.building_id,
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
    p_max_uses: parsed.data.max_uses,
  })

  if (error) {
    return { success: false, error: 'تَعذَّر إنشاء الرابط.' }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const shareUrl = `${appUrl.replace(/\/$/, '')}/join/${rawToken}`

  revalidatePath('/apartments')
  return { success: true, rawToken, shareUrl }
}

// =============================================
// approvePendingMemberAction — admin only
// =============================================
const approveSchema = z.object({
  pending_id: z.string().uuid(),
  apartment_id: z.string().uuid(),
  relation_type: z.enum(['owner', 'resident', 'representative']),
})

export async function approvePendingMemberAction(
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'يجب تسجيل الدخول.' }

  const parsed = approveSchema.safeParse({
    pending_id: fdGet(formData, 'pending_id'),
    apartment_id: fdGet(formData, 'apartment_id'),
    relation_type: fdGet(formData, 'relation_type'),
  })
  if (!parsed.success) {
    return { success: false, error: 'البيانات غير صالحة.' }
  }

  const { error } = await supabase.rpc('approve_pending_member', {
    p_pending_id: parsed.data.pending_id,
    p_apartment_id: parsed.data.apartment_id,
    p_relation_type: parsed.data.relation_type as ApartmentRelation,
  })

  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('access denied')) return { success: false, error: 'هذه العملية لـ admin فقط.' }
    if (msg.includes('not found')) return { success: false, error: 'الطلب غير موجود.' }
    if (msg.includes('already')) return { success: false, error: 'الطلب تَمت معالجته سابقاً.' }
    if (msg.includes('not in this building')) {
      return { success: false, error: 'الشقة المُختارة لا تَنتمي لعمارتك.' }
    }
    if (msg.includes('duplicate')) {
      return { success: false, error: 'هذا الشخص مَربوط بهذه الشقة بنفس النوع بالفعل.' }
    }
    return { success: false, error: 'تَعذَّر اعتماد الطلب.' }
  }

  revalidatePath('/apartments/pending')
  revalidatePath('/apartments')
  return { success: true, message: 'تم الاعتماد وربط الساكن بالشقة.' }
}

// =============================================
// rejectPendingMemberAction — admin only
// =============================================
const rejectSchema = z.object({
  pending_id: z.string().uuid(),
  reason: z.string().min(3).max(500),
})

export async function rejectPendingMemberAction(
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'يجب تسجيل الدخول.' }

  const parsed = rejectSchema.safeParse({
    pending_id: fdGet(formData, 'pending_id'),
    reason: fdGet(formData, 'reason'),
  })
  if (!parsed.success) {
    return { success: false, error: 'سبب الرفض مطلوب (3-500 حرف).' }
  }

  const { error } = await supabase.rpc('reject_pending_member', {
    p_pending_id: parsed.data.pending_id,
    p_reason: parsed.data.reason,
  })

  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('access denied')) return { success: false, error: 'هذه العملية لـ admin فقط.' }
    if (msg.includes('not found')) return { success: false, error: 'الطلب غير موجود.' }
    if (msg.includes('already')) return { success: false, error: 'الطلب تَمت معالجته سابقاً.' }
    return { success: false, error: 'تَعذَّر رفض الطلب.' }
  }

  revalidatePath('/apartments/pending')
  return { success: true, message: 'تم رفض الطلب.' }
}

// =============================================
// disableJoinLinkAction — admin only, soft disable (no delete)
// =============================================
// v3.35 (Codex round 2 P1): direct UPDATE policy was dropped on
// building_join_links. The action now goes through the disable_join_link
// RPC (SECURITY DEFINER + admin check) which is the only sanctioned path
// to flip disabled_at.
// =============================================
export async function disableJoinLinkAction(
  linkId: string,
): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'يجب تسجيل الدخول.' }

  const { error } = await supabase.rpc('disable_join_link', {
    p_link_id: linkId,
  })

  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('not found')) return { success: false, error: 'الرابط غير موجود.' }
    if (msg.includes('access denied')) {
      return { success: false, error: 'هذه العملية لـ admin العمارة فقط.' }
    }
    return { success: false, error: 'تَعذَّر تَعطيل الرابط.' }
  }

  revalidatePath('/apartments')
  return { success: true, message: 'تم تَعطيل الرابط.' }
}
