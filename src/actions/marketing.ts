'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import {
  sendEmail,
  renderContactNotificationEmail,
  renderContactConfirmationEmail,
} from '@/lib/email'

type ActionResult = { success: true; message?: string } | { success: false; error: string }

// Phase 16 contact form (anon-callable from /contact).
// honeypot is invisible — bots fill it, we reject.
// v0.21: password upfront (option D — unified UX with /subscribe).
const contactRequestSchema = z.object({
  full_name: z.string().min(2).max(120),
  email: z.string().email().max(254),
  phone: z.string().max(40).optional().or(z.literal('')),
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
  interested_tier: z
    .enum(['trial', 'basic', 'pro', 'enterprise'])
    .optional()
    .or(z.literal('')),
  message: z.string().max(2000).optional().or(z.literal('')),
  honeypot: z.string().max(0).optional().or(z.literal('')),
})

function fdGet(form: FormData, key: string): string | undefined {
  const v = form.get(key)
  return typeof v === 'string' ? v : undefined
}

/**
 * Public contact form submission.
 *
 * Defenses (in order, fail-fast):
 * 1. Rate limit by IP (3/IP/hour)
 * 2. Honeypot field — must be empty
 * 3. Zod validation
 * 4. RLS allows anon INSERT (DB-side; bot can't pretend to be super_admin)
 * 5. Email is best-effort: DB save succeeds even if email fails (PLAN v3.27)
 *
 * Returns success even if email fails — the operator sees the row in
 * /super-admin/requests and can reach out manually.
 */
export async function submitContactRequestAction(
  formData: FormData,
): Promise<ActionResult> {
  // 1) rate limit by IP
  const hdrs = await headers()
  const ip = getClientIp(hdrs) ?? 'unknown'
  const rl = checkRateLimit(`contact:${ip}`, 3, 60 * 60 * 1000)
  if (!rl.success) {
    return { success: false, error: 'كثير من المحاولات. حاول لاحقاً.' }
  }

  // 2) parse + validate (honeypot rejected by max(0))
  const parsed = contactRequestSchema.safeParse({
    full_name: fdGet(formData, 'full_name') ?? '',
    email: fdGet(formData, 'email') ?? '',
    phone: fdGet(formData, 'phone') ?? '',
    password: fdGet(formData, 'password') ?? '',
    building_name: fdGet(formData, 'building_name') ?? '',
    city: fdGet(formData, 'city') ?? '',
    estimated_apartments: fdGet(formData, 'estimated_apartments') ?? '',
    interested_tier: fdGet(formData, 'interested_tier') ?? '',
    message: fdGet(formData, 'message') ?? '',
    honeypot: fdGet(formData, 'honeypot') ?? '',
  })
  if (!parsed.success) {
    // honeypot violations LOOK like normal validation failures — don't tip off bots
    return {
      success: false,
      error: parsed.error.errors[0]?.message ?? 'البيانات غير صالحة. تَحقَّق وحاول مجدَّداً.',
    }
  }

  const data = parsed.data

  // 3) Submission via SECURITY DEFINER RPC + service_role admin client.
  //
  // v3.32 (Codex round 4 P2): we revoked direct anon INSERT on
  // subscription_requests. The contact form's only path now is:
  //   server action (HTTP-layer rate limit + Zod) → submit_contact_request RPC
  //   (server-only, DB-layer length+honeypot+status validation) → INSERT
  //
  // This closes the bypass where anyone could call PostgREST directly with
  // the public anon key and dodge the action's rate limit. Direct INSERT
  // is now blocked by the absence of a policy; direct RPC is blocked by
  // GRANT being service_role only.
  //
  // service_role is intentionally narrow: this RPC + log_email_failure RPC.
  // No table writes via admin client — the DEFINER RPCs enforce all
  // constraints internally (length, honeypot, status forced).
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    // SUPABASE_SERVICE_ROLE_KEY missing — the contact path requires it
    // (see .env.example). Surface a clear error instead of silently failing.
    return {
      success: false,
      error: 'الخدمة غير مُكوَّنة بشكل صحيح. تواصل مع إدارة المنصة.',
    }
  }

  // v0.21 (option D): pre-create auth user with the chosen password. Same
  // pattern as Phase 20 /subscribe. The user can login immediately but is
  // gated to /account/pending until super_admin reviews the request.
  const { getAuthAdmin } = await import('@/lib/supabase/auth-admin')
  const authAdmin = getAuthAdmin()
  const { data: createdUser, error: createErr } = await authAdmin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true,
    user_metadata: {
      full_name: data.full_name,
      phone: data.phone || null,
    },
  })

  if (createErr || !createdUser?.user) {
    console.error('[contact] createUser failed:', {
      email: data.email,
      message: createErr?.message,
      status: createErr?.status,
      code: (createErr as { code?: string } | null)?.code,
    })
    const msg = createErr?.message?.toLowerCase() ?? ''
    if (
      msg.includes('already') ||
      msg.includes('exists') ||
      msg.includes('duplicate') ||
      msg.includes('registered')
    ) {
      return {
        success: false,
        error:
          'هذا البَريد مُسَجَّل سابقاً. سَجِّل الدخول من /login، أو استَخدم بَريداً مُختلفاً.',
      }
    }
    if (msg.includes('password')) {
      return { success: false, error: 'كلمة المرور غير صالحة. استَخدم 8 أحرف على الأقل.' }
    }
    return {
      success: false,
      error: `تَعذَّر إنشاء الحساب: ${createErr?.message ?? 'سبب غير مَعروف'}`,
    }
  }
  const userId = createdUser.user.id

  const { data: insertedId, error: insertErr } = await admin.rpc(
    'submit_contact_request',
    {
      p_full_name: data.full_name,
      p_email: data.email,
      p_phone: data.phone || null,
      p_building_name: data.building_name,
      p_city: data.city || null,
      p_estimated_apartments: data.estimated_apartments,
      p_interested_tier: data.interested_tier || null,
      p_message: data.message || null,
      p_honeypot: data.honeypot || null,
      p_user_id: userId,
    },
  )

  if (insertErr || !insertedId) {
    // RPC failed AFTER auth user was created → orphan account. Best-effort
    // cleanup so the email is reusable.
    try {
      await authAdmin.deleteUser(userId)
    } catch {
      // last-resort
    }
    return { success: false, error: 'تَعذَّر إرسال الطلب. حاول مجدَّداً.' }
  }

  // Pin the id so the email-audit closure below has a non-null reference
  // (TypeScript can't narrow `insertedId` through a closure boundary).
  const requestId: string = insertedId

  // 4) Email — BEST EFFORT. Failure does NOT roll back the DB.
  //
  // v3.30 fix (Codex P2 #3): every failure (config_missing OR send_failed)
  // is recorded in audit_logs via the SECURITY DEFINER RPC `log_email_failure`,
  // so super_admin sees the failure in /super-admin/audit and can retry/follow
  // up manually. The DB INSERT above is NEVER rolled back.
  const notificationTo = process.env.SUPER_ADMIN_NOTIFICATION_EMAIL
  const notificationPromise = notificationTo
    ? sendEmail({
        to: notificationTo,
        replyTo: data.email,
        ...renderContactNotificationEmail({
          full_name: data.full_name,
          email: data.email,
          phone: data.phone || null,
          building_name: data.building_name,
          city: data.city || null,
          estimated_apartments: data.estimated_apartments,
          interested_tier: data.interested_tier || null,
          message: data.message || null,
        }),
      })
    : Promise.resolve({ sent: false as const, reason: 'config_missing' as const })

  const confirmationPromise = sendEmail({
    to: data.email,
    ...renderContactConfirmationEmail({
      full_name: data.full_name,
      building_name: data.building_name,
    }),
  })

  const [notifResult, confirmResult] = await Promise.allSettled([
    notificationPromise,
    confirmationPromise,
  ])

  // Helper: emit one audit log row per failed email. Failure of THIS log
  // call is itself swallowed (don't loop into infinite failure mode).
  //
  // Reuses the same `admin` client created for submit_contact_request above
  // — both RPCs are server-only (service_role only). This is the narrow
  // scope agreed in round 3: admin client touches ONLY these two RPCs, no
  // direct table access.
  async function logFailure(
    kind: 'notification' | 'confirmation',
    to: string,
    reason: string,
  ) {
    try {
      await admin.rpc('log_email_failure', {
        p_entity_type: 'subscription_request',
        p_entity_id: requestId,
        p_email_to: to,
        p_email_kind: kind,
        p_reason: reason,
      })
    } catch (e) {
      // last-resort: don't crash the request thread on audit-log failure
      console.warn('[marketing] log_email_failure rpc failed:', e)
    }
  }

  if (notifResult.status === 'fulfilled') {
    if (!notifResult.value.sent) {
      await logFailure(
        'notification',
        notificationTo ?? '(unset)',
        notifResult.value.reason +
          (notifResult.value.reason === 'send_failed' && notifResult.value.error
            ? `: ${notifResult.value.error}`
            : ''),
      )
    }
  } else {
    await logFailure(
      'notification',
      notificationTo ?? '(unset)',
      `unexpected: ${String(notifResult.reason).slice(0, 200)}`,
    )
  }

  if (confirmResult.status === 'fulfilled') {
    if (!confirmResult.value.sent) {
      await logFailure(
        'confirmation',
        data.email,
        confirmResult.value.reason +
          (confirmResult.value.reason === 'send_failed' && confirmResult.value.error
            ? `: ${confirmResult.value.error}`
            : ''),
      )
    }
  } else {
    await logFailure(
      'confirmation',
      data.email,
      `unexpected: ${String(confirmResult.reason).slice(0, 200)}`,
    )
  }

  // Revalidate super-admin requests page so the new row shows immediately
  // when super_admin opens it.
  revalidatePath('/super-admin/requests')

  return {
    success: true,
    message: 'تم استلام طلبك. سَنَتواصل معك خلال 24 ساعة.',
  }
}

// =============================================
// updatePlatformSettingsAction — super_admin only
// =============================================
// Updates a single platform_settings row by key. Used by the
// /super-admin/settings UI to set bank_account, vat_rate, vat_enabled.
// =============================================

const platformSettingsSchema = z.object({
  key: z.enum(['bank_account', 'vat_rate', 'vat_enabled']),
  value: z.string().min(1).max(4000), // raw JSON string from form
})

export async function updatePlatformSettingsAction(
  formData: FormData,
): Promise<ActionResult> {
  // super_admin gate
  const { isSuperAdmin } = await import('@/lib/permissions')
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'يجب تسجيل الدخول' }
  if (!(await isSuperAdmin(user.id))) {
    return { success: false, error: 'هذه العملية لـ super_admin فقط' }
  }

  const parsed = platformSettingsSchema.safeParse({
    key: fdGet(formData, 'key'),
    value: fdGet(formData, 'value'),
  })
  if (!parsed.success) {
    return { success: false, error: 'بيانات غير صالحة' }
  }

  // Validate value is valid JSON (super_admin sends string from textarea/inputs)
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(parsed.data.value)
  } catch {
    return { success: false, error: 'القيمة ليست JSON صالحة' }
  }

  // Per-key shape validation
  if (parsed.data.key === 'bank_account') {
    const shape = z.object({
      bank_name: z.string().min(1),
      account_holder: z.string().min(1),
      iban: z.string(),
      account_number: z.string(),
    })
    const r = shape.safeParse(parsedJson)
    if (!r.success) {
      return { success: false, error: 'بيانات الحساب البنكي ناقصة' }
    }
  } else if (parsed.data.key === 'vat_rate') {
    if (typeof parsedJson !== 'number' || parsedJson < 0 || parsedJson > 1) {
      return { success: false, error: 'نسبة VAT يجب أن تَكون بين 0 و 1' }
    }
  } else if (parsed.data.key === 'vat_enabled') {
    if (typeof parsedJson !== 'boolean') {
      return { success: false, error: 'vat_enabled يجب أن تَكون boolean' }
    }
  }

  const { error } = await supabase
    .from('platform_settings')
    .update({
      value: parsedJson as never,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq('key', parsed.data.key)

  if (error) {
    return { success: false, error: 'تَعذَّر تَحديث الإعدادات' }
  }

  revalidatePath('/super-admin/settings')
  return { success: true, message: 'تم التَحديث' }
}

// =============================================
// updateSubscriptionRequestStatusAction — super_admin only
// =============================================
// Updates status/notes on a subscription_request row from /super-admin/requests.
// =============================================

const updateRequestSchema = z.object({
  request_id: z.string().uuid(),
  status: z.enum(['new', 'contacted', 'qualified', 'closed_won', 'closed_lost']),
  notes: z.string().max(4000).optional().or(z.literal('')),
})

export async function updateSubscriptionRequestStatusAction(
  formData: FormData,
): Promise<ActionResult> {
  const { isSuperAdmin } = await import('@/lib/permissions')
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'يجب تسجيل الدخول' }
  if (!(await isSuperAdmin(user.id))) {
    return { success: false, error: 'هذه العملية لـ super_admin فقط' }
  }

  const parsed = updateRequestSchema.safeParse({
    request_id: fdGet(formData, 'request_id'),
    status: fdGet(formData, 'status'),
    notes: fdGet(formData, 'notes') ?? '',
  })
  if (!parsed.success) {
    return { success: false, error: 'بيانات غير صالحة' }
  }

  const { error } = await supabase
    .from('subscription_requests')
    .update({
      status: parsed.data.status,
      notes: parsed.data.notes || null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.request_id)

  if (error) {
    return { success: false, error: 'تَعذَّر تَحديث الطلب' }
  }

  revalidatePath('/super-admin/requests')
  return { success: true, message: 'تم التَحديث' }
}
