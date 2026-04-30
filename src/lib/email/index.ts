import 'server-only'

/**
 * Email integration — Resend wrapper with graceful failure (Phase 16).
 *
 * Design principles (PLAN v3.27 §16):
 * 1. Email is "best-effort" — failure NEVER blocks the operation.
 * 2. If RESEND_API_KEY is missing (e.g., dev without setup), we log a warning
 *    and return { sent: false, reason: 'config_missing' }. The caller's
 *    operation still succeeds (DB insert, etc.).
 * 3. If Resend API fails (network, quota, invalid email), we catch and log.
 *    No throw to the caller.
 * 4. Caller decides whether to surface the failure (audit log row, etc.).
 *
 * Provider chosen: Resend (https://resend.com)
 *   - 3,000 emails/month free tier
 *   - Simple API + good deliverability
 *   - Saudi region not yet supported but EU/US works fine for now
 *
 * Env vars:
 *   - RESEND_API_KEY        : "re_xxxxx" (server-only)
 *   - RESEND_FROM_EMAIL     : verified sender (e.g., "noreply@imarah.example")
 *   - SUPER_ADMIN_NOTIFICATION_EMAIL : where new contact requests notify
 */

export type SendEmailResult =
  | { sent: true; id: string }
  | { sent: false; reason: 'config_missing' | 'send_failed'; error?: string }

interface SendEmailParams {
  to: string | string[]
  subject: string
  html: string
  text?: string
  /** Optional reply-to (e.g., the contact form submitter's email) */
  replyTo?: string
}

/**
 * Send an email via Resend. Never throws. Returns a typed result.
 *
 * Caller should:
 * - Continue the operation regardless of result
 * - Optionally log `result` to audit_logs for super_admin retry visibility
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL

  // Graceful path 1: config not set (dev or pre-launch)
  if (!apiKey || !fromEmail) {
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '[email] RESEND_API_KEY or RESEND_FROM_EMAIL not configured. Email skipped.',
        { to: params.to, subject: params.subject },
      )
    }
    return { sent: false, reason: 'config_missing' }
  }

  // Graceful path 2: try to send, catch all failures
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: Array.isArray(params.to) ? params.to : [params.to],
        subject: params.subject,
        html: params.html,
        ...(params.text ? { text: params.text } : {}),
        ...(params.replyTo ? { reply_to: params.replyTo } : {}),
      }),
      // Defense: 10s timeout — don't block the request thread on Resend issues
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => 'unknown')
      console.error('[email] Resend API returned non-ok:', response.status, errText)
      return {
        sent: false,
        reason: 'send_failed',
        error: `${response.status}: ${errText.slice(0, 200)}`,
      }
    }

    const data = (await response.json()) as { id?: string }
    return { sent: true, id: data.id ?? 'unknown' }
  } catch (err) {
    console.error('[email] Resend send failed:', err)
    return {
      sent: false,
      reason: 'send_failed',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Notification email body for super_admin when a new contact request arrives.
 * Plain HTML, RTL, Arabic.
 */
export function renderContactNotificationEmail(payload: {
  full_name: string
  email: string
  phone: string | null
  building_name: string
  city: string | null
  estimated_apartments: number | null
  interested_tier: string | null
  message: string | null
}): { subject: string; html: string } {
  const subject = `طلب اشتراك جديد — ${payload.building_name}`
  const rows: Array<[string, string | null]> = [
    ['الاسم', payload.full_name],
    ['البريد', payload.email],
    ['الجوال', payload.phone],
    ['اسم العمارة', payload.building_name],
    ['المدينة', payload.city],
    [
      'عدد الشقق المتوقَّع',
      payload.estimated_apartments != null ? String(payload.estimated_apartments) : null,
    ],
    ['الباقة المُهتَم بها', payload.interested_tier],
    ['الرسالة', payload.message],
  ]

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<body style="font-family: 'Tajawal', system-ui, -apple-system, sans-serif; padding: 24px; background: #f8f9fa; color: #1a1a1a;">
  <div style="max-width: 560px; margin: 0 auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px;">
    <h2 style="margin: 0 0 12px; font-size: 18px;">طلب اشتراك جديد</h2>
    <p style="margin: 0 0 18px; color: #4b5563; font-size: 14px;">
      وصلك طلب جديد عبر نموذج /contact:
    </p>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      ${rows
        .filter(([, v]) => v && v.trim())
        .map(
          ([label, value]) => `
        <tr>
          <td style="padding: 8px 12px 8px 0; color: #6b7280; vertical-align: top; white-space: nowrap;">${escapeHtml(label)}</td>
          <td style="padding: 8px 0; color: #1a1a1a; white-space: pre-wrap;">${escapeHtml(value!)}</td>
        </tr>`,
        )
        .join('')}
    </table>
    <p style="margin: 24px 0 0; color: #9ca3af; font-size: 12px;">
      راجع الطلب من /super-admin/requests للرد عليه.
    </p>
  </div>
</body>
</html>`

  return { subject, html }
}

/**
 * Confirmation email back to the submitter.
 */
export function renderContactConfirmationEmail(payload: {
  full_name: string
  building_name: string
}): { subject: string; html: string } {
  const subject = 'تم استلام طلبك — إدارة العمارة'
  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<body style="font-family: 'Tajawal', system-ui, -apple-system, sans-serif; padding: 24px; background: #f8f9fa; color: #1a1a1a;">
  <div style="max-width: 560px; margin: 0 auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px;">
    <h2 style="margin: 0 0 12px; font-size: 18px;">شكراً ${escapeHtml(payload.full_name)} 👋</h2>
    <p style="margin: 0 0 14px; color: #4b5563; font-size: 14px; line-height: 1.7;">
      وصلنا طلبك للاشتراك في "إدارة العمارة" لـ <strong>${escapeHtml(payload.building_name)}</strong>.
    </p>
    <p style="margin: 0 0 14px; color: #4b5563; font-size: 14px; line-height: 1.7;">
      سَنَتواصل معك خلال 24 ساعة لإكمال خطوات التَفعيل.
    </p>
    <p style="margin: 24px 0 0; color: #9ca3af; font-size: 12px;">
      هذه رسالة تلقائية — لا تُجب عليها.
    </p>
  </div>
</body>
</html>`

  return { subject, html }
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

// =============================================
// Phase 18 templates — subscription order lifecycle emails
// =============================================

interface BankAccountForEmail {
  bank_name: string
  account_holder: string
  iban: string
  account_number: string
}

/**
 * Sent right after the visitor submits the /subscribe form.
 * Includes the bank account details + reference + receipt-upload link.
 */
export function renderOrderCreatedEmail(payload: {
  full_name: string
  building_name: string
  reference_number: string
  total_amount: number
  currency: string
  bank: BankAccountForEmail
  receipt_url: string
}): { subject: string; html: string } {
  const subject = `طلب اشتراك ${payload.reference_number} — اتبع الخطوات التالية`
  const amountFmt = `${payload.total_amount.toLocaleString('ar-SA')} ${payload.currency}`
  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<body style="font-family: 'Tajawal', system-ui, -apple-system, sans-serif; padding: 24px; background: #f8f9fa; color: #1a1a1a;">
  <div style="max-width: 560px; margin: 0 auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px;">
    <h2 style="margin: 0 0 12px; font-size: 18px;">شكراً ${escapeHtml(payload.full_name)} 👋</h2>
    <p style="margin: 0 0 18px; color: #4b5563; font-size: 14px; line-height: 1.7;">
      وصلنا طلبك للاشتراك لـ <strong>${escapeHtml(payload.building_name)}</strong>.
      رقم المرجع: <strong style="font-family: monospace;">${escapeHtml(payload.reference_number)}</strong>.
    </p>

    <h3 style="margin: 24px 0 8px; font-size: 16px;">المبلغ المُستحق</h3>
    <p style="margin: 0 0 18px; font-size: 24px; font-weight: 700;">${escapeHtml(amountFmt)}</p>

    <h3 style="margin: 24px 0 8px; font-size: 16px;">بيانات الحساب البنكي</h3>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 18px;">
      <tr><td style="padding: 6px 12px 6px 0; color: #6b7280;">البنك</td><td>${escapeHtml(payload.bank.bank_name)}</td></tr>
      <tr><td style="padding: 6px 12px 6px 0; color: #6b7280;">اسم الحساب</td><td>${escapeHtml(payload.bank.account_holder)}</td></tr>
      <tr><td style="padding: 6px 12px 6px 0; color: #6b7280;">IBAN</td><td style="font-family: monospace;">${escapeHtml(payload.bank.iban)}</td></tr>
      <tr><td style="padding: 6px 12px 6px 0; color: #6b7280;">رقم الحساب</td><td style="font-family: monospace;">${escapeHtml(payload.bank.account_number)}</td></tr>
    </table>

    <p style="margin: 0 0 14px; font-size: 14px; color: #1a1a1a;">
      ⚠️ اذكر رقم المرجع <strong style="font-family: monospace;">${escapeHtml(payload.reference_number)}</strong> في حقل البيان عند التَحويل.
    </p>

    <p style="margin: 24px 0 14px; color: #4b5563; font-size: 14px;">بعد التحويل، ارفع صورة الإيصال هنا:</p>

    <p style="margin: 0 0 24px;">
      <a href="${payload.receipt_url}"
         style="display: inline-block; background: #1a1a1a; color: #fff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-size: 14px;">
        رفع الإيصال →
      </a>
    </p>

    <p style="margin: 0; color: #9ca3af; font-size: 12px;">
      احفظ هذا البريد للرجوع للرابط لاحقاً. الرابط صالح 30 يوماً.
    </p>
  </div>
</body>
</html>`
  return { subject, html }
}

/**
 * Sent after super_admin approves the order.
 * Tells the customer to expect a Supabase invite next + dashboard link.
 *
 * IMPORTANT: NEVER include credentials. Just confirm + link to setup flow.
 */
export function renderOrderApprovedEmail(payload: {
  full_name: string
  building_name: string
  reference_number: string
  dashboard_url: string
}): { subject: string; html: string } {
  const subject = `تم اعتماد اشتراكك — ${payload.reference_number}`
  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<body style="font-family: 'Tajawal', system-ui, -apple-system, sans-serif; padding: 24px; background: #f8f9fa; color: #1a1a1a;">
  <div style="max-width: 560px; margin: 0 auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px;">
    <h2 style="margin: 0 0 12px; font-size: 18px;">🎉 تم اعتماد اشتراكك</h2>
    <p style="margin: 0 0 14px; color: #4b5563; font-size: 14px; line-height: 1.7;">
      أهلاً ${escapeHtml(payload.full_name)}، تم تأكيد التَحويل واعتماد اشتراك
      <strong>${escapeHtml(payload.building_name)}</strong>.
    </p>

    <h3 style="margin: 24px 0 8px; font-size: 16px;">الخطوة التالية</h3>
    <ol style="margin: 0 0 18px; padding-right: 20px; color: #1a1a1a; font-size: 14px; line-height: 1.8;">
      <li>ستَستلم بريداً مُنفصلاً من Supabase (موضوعه "Confirm your invite") لإعداد كلمة مرورك.</li>
      <li>اضغط الرابط في ذلك البريد + ضع كلمة مرور قوية.</li>
      <li>بعد إعداد كلمة المرور، ادخل لوحة عمارتك من الرابط أدناه.</li>
    </ol>

    <p style="margin: 24px 0;">
      <a href="${payload.dashboard_url}"
         style="display: inline-block; background: #1a1a1a; color: #fff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-size: 14px;">
        الدخول للوحة التَحكم →
      </a>
    </p>

    <p style="margin: 24px 0 0; color: #9ca3af; font-size: 12px;">
      رقم المرجع للسجلات: <span style="font-family: monospace;">${escapeHtml(payload.reference_number)}</span>
    </p>
  </div>
</body>
</html>`
  return { subject, html }
}

/**
 * Sent after super_admin rejects the order. Includes the reason + retry link.
 */
export function renderOrderRejectedEmail(payload: {
  full_name: string
  reference_number: string
  reason: string
  retry_url: string
  attempts_remaining: number
}): { subject: string; html: string } {
  const subject = `لم نتمكن من تأكيد التحويل — ${payload.reference_number}`
  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<body style="font-family: 'Tajawal', system-ui, -apple-system, sans-serif; padding: 24px; background: #f8f9fa; color: #1a1a1a;">
  <div style="max-width: 560px; margin: 0 auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px;">
    <h2 style="margin: 0 0 12px; font-size: 18px;">لم نتمكن من تأكيد التحويل</h2>
    <p style="margin: 0 0 14px; color: #4b5563; font-size: 14px; line-height: 1.7;">
      أهلاً ${escapeHtml(payload.full_name)}،
      راجعنا الإيصال المرفوع لطلب <strong style="font-family: monospace;">${escapeHtml(payload.reference_number)}</strong>،
      لكن لم نَستطع تأكيد التَحويل.
    </p>

    <div style="background: #fef2f2; border-right: 4px solid #ef4444; padding: 12px 16px; margin: 18px 0; font-size: 14px; color: #1a1a1a;">
      <strong>السبب:</strong> ${escapeHtml(payload.reason)}
    </div>

    ${
      payload.attempts_remaining > 0
        ? `<p style="margin: 14px 0; color: #4b5563; font-size: 14px;">
             يُمكنك إعادة رفع إيصال صحيح (المتبقي ${payload.attempts_remaining} محاولات).
           </p>
           <p style="margin: 24px 0;">
             <a href="${payload.retry_url}"
                style="display: inline-block; background: #1a1a1a; color: #fff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-size: 14px;">
               إعادة رفع إيصال →
             </a>
           </p>`
        : `<p style="margin: 14px 0; color: #4b5563; font-size: 14px;">
             تم استنفاد المحاولات لهذا الطلب. يُمكنك بدء طلب جديد من <a href="${payload.retry_url}">صفحة الباقات</a>،
             أو التواصل معنا عبر <a href="mailto:support">support</a>.
           </p>`
    }
  </div>
</body>
</html>`
  return { subject, html }
}

// =============================================
// Phase 19 — Renewal email templates + reminders
// =============================================

/**
 * Sent when an admin opens a renewal/upgrade order from /subscribe?renew=true.
 * Mirrors renderOrderCreatedEmail but with renewal phrasing + plan-change diff.
 */
export function renderRenewalCreatedEmail(payload: {
  full_name: string
  building_name: string
  reference_number: string
  total_amount: number
  currency: string
  is_plan_change: boolean
  previous_tier?: string
  new_tier: string
  cycle: 'monthly' | 'yearly'
  bank: BankAccountForEmail
  receipt_url: string
}): { subject: string; html: string } {
  const subject = payload.is_plan_change
    ? `طلب ترقية باقة ${payload.reference_number}`
    : `طلب تجديد اشتراك ${payload.reference_number}`
  const amountFmt = `${payload.total_amount.toLocaleString('ar-SA')} ${payload.currency}`
  const cycleLabel = payload.cycle === 'monthly' ? 'شهرياً' : 'سنوياً'
  const headline = payload.is_plan_change
    ? `طلب ترقية إلى باقة <strong>${escapeHtml(payload.new_tier)}</strong>${payload.previous_tier ? ` (من <strong>${escapeHtml(payload.previous_tier)}</strong>)` : ''}`
    : `طلب تجديد على باقة <strong>${escapeHtml(payload.new_tier)}</strong>`

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<body style="font-family: 'Tajawal', system-ui, -apple-system, sans-serif; padding: 24px; background: #f8f9fa; color: #1a1a1a;">
  <div style="max-width: 560px; margin: 0 auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px;">
    <h2 style="margin: 0 0 12px; font-size: 18px;">شكراً ${escapeHtml(payload.full_name)} 👋</h2>
    <p style="margin: 0 0 18px; color: #4b5563; font-size: 14px; line-height: 1.7;">
      ${headline} لـ <strong>${escapeHtml(payload.building_name)}</strong>.<br/>
      رقم المرجع: <strong style="font-family: monospace;">${escapeHtml(payload.reference_number)}</strong>.
    </p>

    <h3 style="margin: 24px 0 8px; font-size: 16px;">المبلغ المُستحق (${cycleLabel})</h3>
    <p style="margin: 0 0 18px; font-size: 24px; font-weight: 700;">${escapeHtml(amountFmt)}</p>

    <h3 style="margin: 24px 0 8px; font-size: 16px;">بيانات الحساب البنكي</h3>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 18px;">
      <tr><td style="padding: 6px 12px 6px 0; color: #6b7280;">البنك</td><td>${escapeHtml(payload.bank.bank_name)}</td></tr>
      <tr><td style="padding: 6px 12px 6px 0; color: #6b7280;">اسم الحساب</td><td>${escapeHtml(payload.bank.account_holder)}</td></tr>
      <tr><td style="padding: 6px 12px 6px 0; color: #6b7280;">IBAN</td><td style="font-family: monospace;">${escapeHtml(payload.bank.iban)}</td></tr>
      <tr><td style="padding: 6px 12px 6px 0; color: #6b7280;">رقم الحساب</td><td style="font-family: monospace;">${escapeHtml(payload.bank.account_number)}</td></tr>
    </table>

    <p style="margin: 0 0 14px; font-size: 14px; color: #1a1a1a;">
      ⚠️ اذكر رقم المرجع <strong style="font-family: monospace;">${escapeHtml(payload.reference_number)}</strong> في حقل البيان عند التَحويل.
    </p>

    <p style="margin: 24px 0 14px; color: #4b5563; font-size: 14px;">بعد التحويل، ارفع صورة الإيصال هنا:</p>

    <p style="margin: 0 0 24px;">
      <a href="${payload.receipt_url}"
         style="display: inline-block; background: #1a1a1a; color: #fff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-size: 14px;">
        رفع الإيصال →
      </a>
    </p>

    <p style="margin: 0; color: #9ca3af; font-size: 12px;">
      احفظ هذا البريد للرجوع للرابط لاحقاً. الرابط صالح 30 يوماً. خدمتك الحالية لا تَتأثَّر حتى يَتم اعتماد الدفع.
    </p>
  </div>
</body>
</html>`
  return { subject, html }
}

/**
 * Sent after super_admin approves a renewal order. Tells admin the
 * subscription is extended (no Supabase invite — they already have access).
 */
export function renderRenewalApprovedEmail(payload: {
  full_name: string
  building_name: string
  reference_number: string
  new_ends_at: string                       // ISO date
  is_plan_change: boolean
  new_tier: string
  dashboard_url: string
}): { subject: string; html: string } {
  const subject = payload.is_plan_change
    ? `تم اعتماد ترقية الباقة — ${payload.reference_number}`
    : `تم تجديد الاشتراك — ${payload.reference_number}`
  // Format date as YYYY-MM-DD in Arabic numerals
  const endDate = new Date(payload.new_ends_at).toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<body style="font-family: 'Tajawal', system-ui, -apple-system, sans-serif; padding: 24px; background: #f8f9fa; color: #1a1a1a;">
  <div style="max-width: 560px; margin: 0 auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px;">
    <h2 style="margin: 0 0 12px; font-size: 18px;">🎉 ${payload.is_plan_change ? 'تم اعتماد ترقية الباقة' : 'تم تجديد الاشتراك'}</h2>
    <p style="margin: 0 0 14px; color: #4b5563; font-size: 14px; line-height: 1.7;">
      أهلاً ${escapeHtml(payload.full_name)}، تم تأكيد التَحويل واعتماد ${payload.is_plan_change ? 'الترقية' : 'التَجديد'}
      لـ <strong>${escapeHtml(payload.building_name)}</strong>.
    </p>

    <h3 style="margin: 24px 0 8px; font-size: 16px;">تفاصيل الاشتراك المُحدَّث</h3>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <tr><td style="padding: 6px 12px 6px 0; color: #6b7280;">الباقة</td><td><strong>${escapeHtml(payload.new_tier)}</strong></td></tr>
      <tr><td style="padding: 6px 12px 6px 0; color: #6b7280;">صالحة حتى</td><td><strong>${escapeHtml(endDate)}</strong></td></tr>
    </table>

    <p style="margin: 24px 0;">
      <a href="${payload.dashboard_url}"
         style="display: inline-block; background: #1a1a1a; color: #fff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-size: 14px;">
        فتح لوحة التَحكم →
      </a>
    </p>

    <p style="margin: 24px 0 0; color: #9ca3af; font-size: 12px;">
      رقم المرجع للسجلات: <span style="font-family: monospace;">${escapeHtml(payload.reference_number)}</span>
    </p>
  </div>
</body>
</html>`
  return { subject, html }
}

/**
 * Sent by daily cron at 30/14/7 days before subscription_ends_at.
 * Admin opens /subscribe?renew=true&building=X to renew.
 */
export function renderSubscriptionReminderEmail(payload: {
  full_name: string
  building_name: string
  days_before: 30 | 14 | 7
  subscription_ends_at: string
  current_tier: string
  renew_url: string
}): { subject: string; html: string } {
  const urgency =
    payload.days_before === 7
      ? 'ينتهي قريباً جداً'
      : payload.days_before === 14
        ? 'ينتهي قريباً'
        : 'ينتهي خلال شهر'
  const subject = `تذكير: اشتراك ${payload.building_name} ${urgency} (${payload.days_before} أيام)`
  const endDate = new Date(payload.subscription_ends_at).toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const banner =
    payload.days_before === 7
      ? '#fef2f2;border-right:4px solid #ef4444'   // red
      : payload.days_before === 14
        ? '#fefce8;border-right:4px solid #f59e0b'  // amber
        : '#eff6ff;border-right:4px solid #3b82f6'  // blue

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<body style="font-family: 'Tajawal', system-ui, -apple-system, sans-serif; padding: 24px; background: #f8f9fa; color: #1a1a1a;">
  <div style="max-width: 560px; margin: 0 auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px;">
    <h2 style="margin: 0 0 12px; font-size: 18px;">تذكير بانتهاء الاشتراك ⏰</h2>
    <p style="margin: 0 0 14px; color: #4b5563; font-size: 14px; line-height: 1.7;">
      أهلاً ${escapeHtml(payload.full_name)}، اشتراك
      <strong>${escapeHtml(payload.building_name)}</strong> (باقة <strong>${escapeHtml(payload.current_tier)}</strong>) ينتهي خلال
      <strong>${payload.days_before}</strong> أيام.
    </p>

    <div style="background: ${banner}; padding: 12px 16px; margin: 18px 0; font-size: 14px; color: #1a1a1a;">
      تاريخ الانتهاء: <strong>${escapeHtml(endDate)}</strong>
    </div>

    <p style="margin: 14px 0; color: #4b5563; font-size: 14px;">
      جدِّد الاشتراك الآن لتجنُّب أي انقطاع في الخدمة. التَجديد المُبكِر يَحفظ الأيام المُتبقية ويُضاف إليها مدَّة الباقة الجديدة.
    </p>

    <p style="margin: 24px 0;">
      <a href="${payload.renew_url}"
         style="display: inline-block; background: #1a1a1a; color: #fff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-size: 14px;">
        تجديد الاشتراك →
      </a>
    </p>

    <p style="margin: 24px 0 0; color: #9ca3af; font-size: 12px;">
      هذا تذكير آلي. لو لديك أي استفسار، تواصل معنا عبر صفحة الباقات.
    </p>
  </div>
</body>
</html>`
  return { subject, html }
}
