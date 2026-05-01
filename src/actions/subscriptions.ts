'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { generateRawToken, hashToken } from '@/lib/tokens'
import { isSuperAdmin, hasRole } from '@/lib/permissions'
import {
  sendEmail,
  renderOrderCreatedEmail,
  renderOrderApprovedEmail,
  renderOrderRejectedEmail,
  renderRenewalCreatedEmail,
  renderRenewalApprovedEmail,
} from '@/lib/email'
import type { SubscriptionOrderCycle } from '@/types/database'

type ActionResult = { success: true; message?: string } | { success: false; error: string }
type CreateOrderResult =
  | { success: true; orderId: string; rawToken: string; receiptUrl: string }
  | { success: false; error: string }

function fdGet(form: FormData, key: string): string | undefined {
  const v = form.get(key)
  return typeof v === 'string' ? v : undefined
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}

// =============================================
// createSubscriptionOrderAction — anon, server-only via admin client
// =============================================
// Pattern (lessons #28 + #31): admin client narrow scope. Calls
// create_subscription_order RPC (server-only — GRANT لـ service_role فقط).
// Rate limit lives here (HTTP layer — DB doesn't know IP, lesson #20).
// =============================================
const createOrderSchema = z.object({
  full_name: z.string().min(2).max(120),
  email: z.string().email().max(254),
  phone: z.string().min(5).max(40),
  // v0.20: password upfront. Supabase enforces 6+ by default; we require 8+
  // for safety. The user logs in with these credentials AFTER super_admin
  // approves the order (account exists but stuck on /account/pending).
  password: z
    .string()
    .min(8, 'كلمة المرور يَجب أن تَكون 8 أحرف على الأقل')
    .max(72, 'كلمة المرور طويلة جداً'),
  building_name: z.string().min(2).max(200),
  city: z.string().max(80).optional().or(z.literal('')),
  estimated_apartments: z
    .union([z.string().regex(/^\d+$/), z.literal('')])
    .optional()
    .transform((v) => (v && v !== '' ? Number(v) : null))
    .refine((v) => v === null || (v > 0 && v < 10_000), {
      message: 'invalid apartments count',
    }),
  tier_id: z.enum(['basic', 'pro', 'enterprise']),
  cycle: z.enum(['monthly', 'yearly']),
})

export async function createSubscriptionOrderAction(
  formData: FormData,
): Promise<CreateOrderResult> {
  // (1) IP rate limit — 5 orders/IP/day (HTTP layer enforcement)
  const hdrs = await headers()
  const ip = getClientIp(hdrs) ?? 'unknown'
  const rl = checkRateLimit(`subscribe:create:${ip}`, 5, 24 * 60 * 60 * 1000)
  if (!rl.success) {
    return { success: false, error: 'محاولات كثيرة. حاول لاحقاً.' }
  }

  // (2) Zod
  const parsed = createOrderSchema.safeParse({
    full_name: fdGet(formData, 'full_name') ?? '',
    email: fdGet(formData, 'email') ?? '',
    phone: fdGet(formData, 'phone') ?? '',
    password: fdGet(formData, 'password') ?? '',
    building_name: fdGet(formData, 'building_name') ?? '',
    city: fdGet(formData, 'city') ?? '',
    estimated_apartments: fdGet(formData, 'estimated_apartments') ?? '',
    tier_id: fdGet(formData, 'tier_id') ?? '',
    cycle: fdGet(formData, 'cycle') ?? '',
  })
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors[0]?.message ?? 'البيانات غير صالحة. تَحقَّق وحاول مجدَّداً.',
    }
  }

  const data = parsed.data

  // (3) admin client narrow scope — server-only RPC
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return {
      success: false,
      error: 'الخدمة غير مُكوَّنة بشكل صحيح. تواصل مع إدارة المنصة.',
    }
  }

  // (3.5) v0.20: pre-create auth user with the chosen password.
  // Email is auto-confirmed (email_confirm:true) so the user can login
  // immediately, but they have no membership → middleware redirects them to
  // /account/pending until super_admin approves. This replaces the old
  // "invite-on-approval" flow that required a 3-email dance (order email +
  // Supabase invite + password reset).
  //
  // If the email is already taken (existing user), we surface a clear Arabic
  // error. We do NOT auto-link to the existing account — the operator should
  // resolve manually (the existing account may belong to a different person
  // who happens to share that email).
  const { getAuthAdmin } = await import('@/lib/supabase/auth-admin')
  const authAdmin = getAuthAdmin()
  const { data: createdUser, error: createErr } = await authAdmin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true,
    user_metadata: {
      full_name: data.full_name,
      phone: data.phone,
    },
  })

  if (createErr || !createdUser?.user) {
    const msg = createErr?.message?.toLowerCase() ?? ''
    if (
      msg.includes('already') ||
      msg.includes('exists') ||
      msg.includes('duplicate')
    ) {
      return {
        success: false,
        error:
          'هذا البَريد مُسَجَّل سابقاً. سَجِّل الدخول من /login، أو استَخدم بَريداً مُختلفاً.',
      }
    }
    return { success: false, error: 'تَعذَّر إنشاء الحساب. حاول مجدَّداً.' }
  }
  const userId = createdUser.user.id

  // (4) generate token + hash + RPC (with pre-created user_id)
  const rawToken = generateRawToken()
  const tokenHash = hashToken(rawToken)

  const { data: result, error: rpcErr } = await admin.rpc('create_subscription_order', {
    p_full_name: data.full_name,
    p_email: data.email,
    p_phone: data.phone,
    p_building_name: data.building_name,
    p_city: data.city || null,
    p_estimated_apartments: data.estimated_apartments,
    p_tier_id: data.tier_id,
    p_cycle: data.cycle,
    p_token_hash: tokenHash,
    p_user_id: userId,
  })

  if (rpcErr || !result || result.length === 0) {
    // RPC failed AFTER auth user was created → orphan account. Best-effort
    // cleanup (delete the auth user) so the email is reusable.
    try {
      await authAdmin.deleteUser(userId)
    } catch {
      // last-resort
    }
    return { success: false, error: 'تَعذَّر إنشاء الطلب. حاول مجدَّداً.' }
  }

  const row = result[0]
  if (!row) {
    return { success: false, error: 'تَعذَّر إنشاء الطلب. حاول مجدَّداً.' }
  }
  const orderId = row.order_id
  const referenceNumber = row.reference_number
  // v3.39 fix (Codex P1): use real snapshot total + currency from RPC return.
  // The RPC computes amount/vat/total inside the same transaction as INSERT,
  // so reading these from `result` is consistent with the DB row. Earlier
  // versions hardcoded 0 — customers received "transfer 0 SAR" emails.
  const totalAmount = Number(row.total_amount)
  const currency = row.currency
  const receiptUrl = `${appUrl()}/subscribe/${orderId}?t=${rawToken}`

  // (5) best-effort email — DB integrity is source of truth, email is notification.
  // Fetch bank details via admin (RPC requires super_admin auth.uid for direct call,
  // but admin client doesn't have one — we'd hit "Access denied". Workaround: read
  // platform_settings directly via service_role for this email-only purpose).
  const { data: bankRow } = await admin
    .from('platform_settings')
    .select('value')
    .eq('key', 'bank_account')
    .maybeSingle()

  const bank =
    bankRow?.value &&
    typeof bankRow.value === 'object' &&
    !Array.isArray(bankRow.value)
      ? (bankRow.value as Record<string, string>)
      : { bank_name: '', account_holder: '', iban: '', account_number: '' }

  const emailResult = await sendEmail({
    to: data.email,
    ...renderOrderCreatedEmail({
      full_name: data.full_name,
      building_name: data.building_name,
      reference_number: referenceNumber,
      total_amount: totalAmount,
      currency,
      bank: {
        bank_name: String(bank.bank_name ?? ''),
        account_holder: String(bank.account_holder ?? ''),
        iban: String(bank.iban ?? ''),
        account_number: String(bank.account_number ?? ''),
      },
      receipt_url: receiptUrl,
    }),
  })

  if (!emailResult.sent) {
    // Log failure but don't fail the action — DB integrity preserved
    try {
      await admin.rpc('log_email_failure', {
        p_entity_type: 'subscription_order',
        p_entity_id: orderId,
        p_email_to: data.email,
        p_email_kind: 'notification',
        p_reason:
          emailResult.reason +
          (emailResult.reason === 'send_failed' && emailResult.error
            ? `: ${emailResult.error}`
            : ''),
      })
    } catch {
      // last-resort: don't crash on audit-log failure
    }
  }

  return { success: true, orderId, rawToken, receiptUrl }
}

// =============================================
// Phase 19 — createRenewalOrderAction (building admin)
// =============================================
// Building admin opens /subscribe?renew=true&building=X. They pick tier+cycle
// (default to current tier — same-tier order = renewal-only, different = upgrade
// or downgrade with plan-change flag). Server action:
//   1. Verifies caller is admin of the building (defense in depth — RPC checks too)
//   2. IP rate limit (3 renewals/IP/day — tighter than new orders)
//   3. Generates raw token + hash
//   4. Calls create_renewal_order RPC (snapshots admin email/name/phone, prices)
//   5. Sends renewal email with bank details + receipt URL
// =============================================
const createRenewalSchema = z.object({
  building_id: z.string().uuid(),
  tier_id: z.enum(['basic', 'pro', 'enterprise']),
  cycle: z.enum(['monthly', 'yearly']),
})

export async function createRenewalOrderAction(
  formData: FormData,
): Promise<CreateOrderResult> {
  // (1) Auth + admin check
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'يجب تسجيل الدخول.' }

  const parsed = createRenewalSchema.safeParse({
    building_id: fdGet(formData, 'building_id'),
    tier_id: fdGet(formData, 'tier_id'),
    cycle: fdGet(formData, 'cycle'),
  })
  if (!parsed.success) {
    return { success: false, error: 'البيانات غير صالحة.' }
  }
  const { building_id, tier_id, cycle } = parsed.data

  // Defense in depth — RPC also checks via user_has_role.
  const isAdmin = await hasRole(building_id, ['admin'], user.id)
  if (!isAdmin && !(await isSuperAdmin(user.id))) {
    return { success: false, error: 'هذه العملية لمدير العمارة فقط.' }
  }

  // (2) IP rate limit (HTTP layer)
  const hdrs = await headers()
  const ip = getClientIp(hdrs) ?? 'unknown'
  const rl = checkRateLimit(`renew:${ip}`, 3, 24 * 60 * 60 * 1000)
  if (!rl.success) {
    return { success: false, error: 'محاولات كثيرة. حاول لاحقاً.' }
  }

  // (3) Token + hash
  const rawToken = generateRawToken()
  const tokenHash = hashToken(rawToken)

  // (4) RPC — runs as the user (not service_role) so user_has_role works
  const { data: result, error: rpcErr } = await supabase.rpc(
    'create_renewal_order',
    {
      p_building_id: building_id,
      p_tier_id: tier_id,
      p_cycle: cycle,
      p_token_hash: tokenHash,
    },
  )

  if (rpcErr) {
    const msg = rpcErr.message?.toLowerCase() ?? ''
    if (msg.includes('already in flight')) {
      return {
        success: false,
        error: 'هناك طلب تجديد قيد المعالجة لهذه العمارة بالفعل.',
      }
    }
    if (msg.includes('access denied')) {
      return { success: false, error: 'هذه العملية لمدير العمارة فقط.' }
    }
    if (msg.includes('tier not available') || msg.includes('cannot renew to trial')) {
      return { success: false, error: 'الباقة المختارة غير متاحة.' }
    }
    if (msg.includes('admin profile missing email')) {
      return {
        success: false,
        error: 'املأ بريدك ورقم هاتفك في الملف الشخصي قبل التَجديد.',
      }
    }
    return { success: false, error: 'تَعذَّر إنشاء طلب التَجديد.' }
  }

  if (!result || result.length === 0) {
    return { success: false, error: 'تَعذَّر إنشاء طلب التَجديد.' }
  }
  const row = result[0]
  if (!row) {
    return { success: false, error: 'تَعذَّر إنشاء طلب التَجديد.' }
  }

  const orderId = row.order_id
  const referenceNumber = row.reference_number
  const totalAmount = Number(row.total_amount)
  const currency = row.currency
  const isPlanChange = !!row.is_plan_change
  const receiptUrl = `${appUrl()}/subscribe/${orderId}?t=${rawToken}`

  // (5) Email — needs admin client only for bank details + building name lookup
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    // Email best-effort — order is created already
    return { success: true, orderId, rawToken, receiptUrl }
  }

  // Look up the order row + building info for the email
  const { data: orderRow } = await admin
    .from('subscription_orders')
    .select('full_name, email, building_name, previous_tier_id')
    .eq('id', orderId)
    .maybeSingle()

  const { data: bankRow } = await admin
    .from('platform_settings')
    .select('value')
    .eq('key', 'bank_account')
    .maybeSingle()

  const bank =
    bankRow?.value &&
    typeof bankRow.value === 'object' &&
    !Array.isArray(bankRow.value)
      ? (bankRow.value as Record<string, string>)
      : { bank_name: '', account_holder: '', iban: '', account_number: '' }

  const fullName = orderRow?.full_name ?? user.email ?? ''
  const adminEmail = orderRow?.email ?? user.email ?? ''
  const buildingName = orderRow?.building_name ?? '—'
  const previousTier = orderRow?.previous_tier_id ?? undefined

  if (adminEmail) {
    const emailResult = await sendEmail({
      to: adminEmail,
      ...renderRenewalCreatedEmail({
        full_name: fullName,
        building_name: buildingName,
        reference_number: referenceNumber,
        total_amount: totalAmount,
        currency,
        is_plan_change: isPlanChange,
        previous_tier: previousTier,
        new_tier: tier_id,
        cycle,
        bank: {
          bank_name: String(bank.bank_name ?? ''),
          account_holder: String(bank.account_holder ?? ''),
          iban: String(bank.iban ?? ''),
          account_number: String(bank.account_number ?? ''),
        },
        receipt_url: receiptUrl,
      }),
    })

    if (!emailResult.sent) {
      try {
        await admin.rpc('log_email_failure', {
          p_entity_type: 'subscription_order',
          p_entity_id: orderId,
          p_email_to: adminEmail,
          p_email_kind: 'notification',
          p_reason:
            emailResult.reason +
            (emailResult.reason === 'send_failed' && emailResult.error
              ? `: ${emailResult.error}`
              : ''),
        })
      } catch {
        // last-resort
      }
    }
  }

  return { success: true, orderId, rawToken, receiptUrl }
}

// =============================================
// approveOrderAction — super_admin, Reserve/Invite/Complete pattern (lesson #19)
// =============================================
// 4 steps:
//   1. RPC reserve_subscription_order_for_provisioning (DB lock, status='provisioning')
//   2. auth.admin.inviteUserByEmail (outside DB)
//   3. RPC complete_provisioning (atomic INSERT building + membership + UPDATE order)
//   4. send approval email (best-effort)
// On failure: RPC mark_provisioning_failed → recoverable state
//
// v0.19 (Phase 19): branches on order.is_renewal — renewal orders skip invite
// (admin already has access) and call complete_renewal which extends ends_at.
// =============================================
const approveSchema = z.object({
  order_id: z.string().uuid(),
})

export async function approveOrderAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'يجب تسجيل الدخول.' }
  if (!(await isSuperAdmin(user.id))) {
    return { success: false, error: 'هذه العملية لـ super_admin فقط.' }
  }

  const parsed = approveSchema.safeParse({ order_id: fdGet(formData, 'order_id') })
  if (!parsed.success) return { success: false, error: 'order_id غير صالح.' }
  const orderId = parsed.data.order_id

  // First, peek at the order to know if it's a renewal (skip invite for renewals)
  const { data: peekRow } = await supabase
    .from('subscription_orders')
    .select('is_renewal, is_plan_change, tier_id, renews_building_id')
    .eq('id', orderId)
    .maybeSingle()

  const isRenewal = peekRow?.is_renewal === true

  // Step 1: Reserve (DB lock)
  const { data: reserved, error: reserveErr } = await supabase.rpc(
    'reserve_subscription_order_for_provisioning',
    { p_order_id: orderId },
  )

  if (reserveErr) {
    const msg = reserveErr.message.toLowerCase()
    if (msg.includes('already being provisioned')) {
      return { success: false, error: 'الطلب قيد المعالجة من super_admin آخر.' }
    }
    if (msg.includes('cannot be reserved')) {
      return { success: false, error: 'الطلب في حالة لا تَسمح بالاعتماد.' }
    }
    if (msg.includes('not found')) return { success: false, error: 'الطلب غير موجود.' }
    return { success: false, error: 'تَعذَّر حجز الطلب.' }
  }

  if (!reserved || reserved.length === 0) {
    return { success: false, error: 'تَعذَّر حجز الطلب.' }
  }

  const orderInfo = reserved[0]
  if (!orderInfo) return { success: false, error: 'تَعذَّر حجز الطلب.' }

  // Phase 19 dispatch: renewals skip invite + use complete_renewal
  if (isRenewal) {
    const { error: renewErr } = await supabase.rpc('complete_renewal', {
      p_order_id: orderId,
    })

    if (renewErr) {
      try {
        await supabase.rpc('mark_provisioning_failed', {
          p_order_id: orderId,
          p_failure_reason: `renewal complete failed: ${renewErr.message.slice(0, 200)}`,
        })
      } catch {
        // last-resort
      }
      return {
        success: false,
        error:
          'تَعذَّر تَطبيق التَجديد على العمارة. الطلب في حالة "فشل" — راجع التفاصيل.',
      }
    }

    // Send renewal approval email (best-effort) — fetch updated ends_at + tier
    const { data: orderRow } = await supabase
      .from('subscription_orders')
      .select('reference_number, is_plan_change, tier_id, renews_building_id')
      .eq('id', orderId)
      .maybeSingle()

    let newEndsAt = ''
    if (orderRow?.renews_building_id) {
      const { data: bldg } = await supabase
        .from('buildings')
        .select('subscription_ends_at')
        .eq('id', orderRow.renews_building_id)
        .maybeSingle()
      newEndsAt = bldg?.subscription_ends_at ?? ''
    }

    const emailResult = await sendEmail({
      to: orderInfo.order_email,
      ...renderRenewalApprovedEmail({
        full_name: orderInfo.order_full_name,
        building_name: orderInfo.order_building_name,
        reference_number: orderRow?.reference_number ?? '—',
        new_ends_at: newEndsAt,
        is_plan_change: !!orderRow?.is_plan_change,
        new_tier: orderRow?.tier_id ?? orderInfo.order_tier_id,
        dashboard_url: `${appUrl()}/dashboard`,
      }),
    })

    if (!emailResult.sent) {
      try {
        const admin = createAdminClient()
        await admin.rpc('log_email_failure', {
          p_entity_type: 'subscription_order',
          p_entity_id: orderId,
          p_email_to: orderInfo.order_email,
          p_email_kind: 'confirmation',
          p_reason:
            emailResult.reason +
            (emailResult.reason === 'send_failed' && emailResult.error
              ? `: ${emailResult.error}`
              : ''),
        })
      } catch {
        // last-resort
      }
    }

    revalidatePath('/super-admin/orders')
    revalidatePath(`/super-admin/orders/${orderId}`)
    return {
      success: true,
      message: 'تم اعتماد التَجديد. أُرسل بريد تأكيد للعميل.',
    }
  }

  // Step 2: Resolve user_id.
  //
  // v0.20: orders created via the new /subscribe flow (with password upfront)
  // already have provisioned_user_id set at order creation. We skip the
  // Supabase auth.admin.inviteUserByEmail step entirely — the user already
  // has a working account, just no membership yet.
  //
  // Legacy fallback: if the order was created without p_user_id (e.g. an
  // older row from before this refactor), we still invite via Supabase Auth.
  let userId: string
  const { data: prereg } = await supabase
    .from('subscription_orders')
    .select('provisioned_user_id')
    .eq('id', orderId)
    .maybeSingle()

  if (prereg?.provisioned_user_id) {
    userId = prereg.provisioned_user_id
  } else {
    // Legacy invite path (pre-v0.20 orders only)
    const { getAuthAdmin } = await import('@/lib/supabase/auth-admin')
    try {
      const authAdmin = getAuthAdmin()
      const { data: invite, error: inviteErr } =
        await authAdmin.inviteUserByEmail(orderInfo.order_email, {
          data: { full_name: orderInfo.order_full_name },
          redirectTo: `${appUrl()}/auth/callback?next=/dashboard`,
        })
      if (inviteErr || !invite.user) {
        throw new Error(inviteErr?.message ?? 'invite returned no user')
      }
      userId = invite.user.id
    } catch (err) {
      const reason =
        err instanceof Error ? `invite failed: ${err.message}` : 'invite failed'
      try {
        await supabase.rpc('mark_provisioning_failed', {
          p_order_id: orderId,
          p_failure_reason: reason,
        })
      } catch {
        // last-resort
      }
      return {
        success: false,
        error:
          'تَعذَّر إرسال دعوة Supabase. الطلب في حالة "فشل الـ provisioning" — يُمكنك إعادة المحاولة.',
      }
    }
  }

  // Step 3: Complete (atomic INSERT building + membership)
  const { error: completeErr } = await supabase.rpc('complete_provisioning', {
    p_order_id: orderId,
    p_user_id: userId,
  })

  if (completeErr) {
    // Orphan invite scenario — invite was sent but DB INSERT failed.
    // Mark as failed; super_admin sees user_id in audit trail for manual cleanup.
    try {
      await supabase.rpc('mark_provisioning_failed', {
        p_order_id: orderId,
        p_failure_reason: `complete failed (user_id=${userId}): ${completeErr.message.slice(0, 200)}`,
      })
    } catch {
      // last-resort
    }
    return {
      success: false,
      error:
        'تم إرسال دعوة لكن فشل تَكوين العمارة. الطلب في حالة "فشل" — راجع التفاصيل واعتمد يدوياً.',
    }
  }

  // Step 4: Send approval email (best-effort)
  const { data: orderRow } = await supabase
    .from('subscription_orders')
    .select('reference_number')
    .eq('id', orderId)
    .maybeSingle()

  const ref = orderRow?.reference_number ?? '—'

  const emailResult = await sendEmail({
    to: orderInfo.order_email,
    ...renderOrderApprovedEmail({
      full_name: orderInfo.order_full_name,
      building_name: orderInfo.order_building_name,
      reference_number: ref,
      dashboard_url: `${appUrl()}/dashboard`,
    }),
  })

  if (!emailResult.sent) {
    try {
      const admin = createAdminClient()
      await admin.rpc('log_email_failure', {
        p_entity_type: 'subscription_order',
        p_entity_id: orderId,
        p_email_to: orderInfo.order_email,
        p_email_kind: 'confirmation',
        p_reason:
          emailResult.reason +
          (emailResult.reason === 'send_failed' && emailResult.error
            ? `: ${emailResult.error}`
            : ''),
      })
    } catch {
      // last-resort
    }
  }

  revalidatePath('/super-admin/orders')
  revalidatePath(`/super-admin/orders/${orderId}`)
  return {
    success: true,
    message: 'تم الاعتماد بنجاح. أُرسلت دعوة Supabase + بريد تأكيد للعميل.',
  }
}

// =============================================
// rejectOrderAction — super_admin
// =============================================
const rejectSchema = z.object({
  order_id: z.string().uuid(),
  reason: z.string().min(3).max(500),
})

export async function rejectOrderAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'يجب تسجيل الدخول.' }
  if (!(await isSuperAdmin(user.id))) {
    return { success: false, error: 'هذه العملية لـ super_admin فقط.' }
  }

  const parsed = rejectSchema.safeParse({
    order_id: fdGet(formData, 'order_id'),
    reason: fdGet(formData, 'reason'),
  })
  if (!parsed.success) {
    return { success: false, error: 'سبب الرفض مَطلوب (3-500 حرف).' }
  }

  const { error } = await supabase.rpc('reject_subscription_order', {
    p_order_id: parsed.data.order_id,
    p_reason: parsed.data.reason,
  })

  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('cannot be rejected')) {
      return { success: false, error: 'الطلب في حالة لا تَسمح بالرفض.' }
    }
    if (msg.includes('not found')) return { success: false, error: 'الطلب غير موجود.' }
    return { success: false, error: 'تَعذَّر رفض الطلب.' }
  }

  // Send rejection email (best-effort)
  const { data: orderRow } = await supabase
    .from('subscription_orders')
    .select('email, full_name, reference_number, rejection_attempt_count')
    .eq('id', parsed.data.order_id)
    .maybeSingle()

  if (orderRow) {
    const attemptsRemaining = Math.max(0, 3 - orderRow.rejection_attempt_count)
    const retryUrl =
      attemptsRemaining > 0
        ? `${appUrl()}/contact`  // Phase 18: instructions to contact for new token
        : `${appUrl()}/pricing`
    const emailResult = await sendEmail({
      to: orderRow.email,
      ...renderOrderRejectedEmail({
        full_name: orderRow.full_name,
        reference_number: orderRow.reference_number,
        reason: parsed.data.reason,
        retry_url: retryUrl,
        attempts_remaining: attemptsRemaining,
      }),
    })

    if (!emailResult.sent) {
      try {
        const admin = createAdminClient()
        await admin.rpc('log_email_failure', {
          p_entity_type: 'subscription_order',
          p_entity_id: parsed.data.order_id,
          p_email_to: orderRow.email,
          p_email_kind: 'confirmation',
          p_reason:
            emailResult.reason +
            (emailResult.reason === 'send_failed' && emailResult.error
              ? `: ${emailResult.error}`
              : ''),
        })
      } catch {
        // last-resort
      }
    }
  }

  revalidatePath('/super-admin/orders')
  revalidatePath(`/super-admin/orders/${parsed.data.order_id}`)
  return { success: true, message: 'تم رفض الطلب وإشعار العميل.' }
}

// =============================================
// resetFailedProvisioningAction — super_admin
// =============================================
export async function resetFailedProvisioningAction(
  orderId: string,
): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'يجب تسجيل الدخول.' }
  if (!(await isSuperAdmin(user.id))) {
    return { success: false, error: 'هذه العملية لـ super_admin فقط.' }
  }

  const { error } = await supabase.rpc('reset_failed_provisioning', {
    p_order_id: orderId,
  })

  if (error) {
    return { success: false, error: 'تَعذَّر إعادة تَعيين الحالة.' }
  }

  revalidatePath('/super-admin/orders')
  revalidatePath(`/super-admin/orders/${orderId}`)
  return {
    success: true,
    message: 'تم إعادة الطلب إلى awaiting_review. يُمكنك المحاولة مَرة أخرى.',
  }
}

// =============================================
// dismissOnboardingWizard — admin marks the onboarding wizard as completed
// =============================================
// Stored in profile (we add a column? No — use user_metadata via admin client).
// Phase 18 keeps this simple: client-side localStorage flag (no DB change needed).
// Server action exists for parity but is currently a no-op — useful when we
// formalize it in a later phase.
// =============================================
export async function dismissOnboardingWizardAction(): Promise<ActionResult> {
  // Future: store completed_at on profiles or user_metadata.
  // For now, the wizard hides itself via localStorage in the client component.
  return { success: true, message: 'تم.' }
}

// Re-export the cycle type so client components don't import from types directly
export type { SubscriptionOrderCycle }
