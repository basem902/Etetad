import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, renderSubscriptionReminderEmail } from '@/lib/email'

/**
 * Daily cron — sends subscription reminders at 30/14/7 days before
 * `subscription_ends_at` for active/trial buildings.
 *
 * Vercel Cron config (in vercel.json):
 *   { "path": "/api/cron/subscription-reminders", "schedule": "0 9 * * *" }
 *   (runs daily at 09:00 UTC)
 *
 * Idempotency: the SQL RPC (`find_and_record_subscription_reminders`) inserts
 * a row in `subscription_reminders_sent` for each (building, days_before,
 * subscription_ends_at) tuple atomically with the SELECT. The unique constraint
 * blocks duplicate sends if the cron fires more than once per day. On renewal,
 * `subscription_ends_at` changes — making the new period a fresh tuple.
 *
 * Email send is best-effort. Failures are tracked via
 * `update_reminder_email_status` so super_admin can see which reminders bounced.
 */
export async function POST(req: NextRequest) {
  return handle(req)
}

export async function GET(req: NextRequest) {
  return handle(req)
}

async function handle(req: NextRequest) {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured' },
      { status: 503 },
    )
  }
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json(
      { error: 'service_role not configured' },
      { status: 503 },
    )
  }

  // Atomically: find candidates + record them. The RPC returns the rows that
  // were just inserted (ones that haven't been sent before for this period).
  const { data: rows, error: rpcErr } = await admin.rpc(
    'find_and_record_subscription_reminders',
  )
  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 500 })
  }

  const reminders = Array.isArray(rows) ? rows : []
  const appUrl =
    (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')

  let sent = 0
  let failed = 0
  let skipped = 0

  for (const r of reminders) {
    const adminEmail = r.admin_email
    if (!adminEmail) {
      // No admin user for this building — skip + record as failed for visibility
      skipped++
      try {
        await admin.rpc('update_reminder_email_status', {
          p_reminder_id: r.reminder_id,
          p_status: 'failed',
          p_error: 'no admin email for building',
        })
      } catch {
        // last-resort
      }
      continue
    }

    const renewUrl = `${appUrl}/subscribe?renew=true&building=${r.building_id}`
    const result = await sendEmail({
      to: adminEmail,
      ...renderSubscriptionReminderEmail({
        full_name: r.admin_full_name ?? adminEmail,
        building_name: r.building_name,
        days_before: r.days_before as 30 | 14 | 7,
        subscription_ends_at: r.subscription_ends_at,
        current_tier: r.tier_id,
        renew_url: renewUrl,
      }),
    })

    if (result.sent) {
      sent++
      try {
        await admin.rpc('update_reminder_email_status', {
          p_reminder_id: r.reminder_id,
          p_status: 'sent',
          p_error: null,
        })
      } catch {
        // last-resort
      }
    } else {
      failed++
      const err =
        result.reason +
        (result.reason === 'send_failed' && result.error
          ? `: ${result.error}`
          : '')
      try {
        await admin.rpc('update_reminder_email_status', {
          p_reminder_id: r.reminder_id,
          p_status: 'failed',
          p_error: err.slice(0, 500),
        })
      } catch {
        // last-resort
      }
    }
  }

  return NextResponse.json({
    success: true,
    found: reminders.length,
    sent,
    failed,
    skipped,
  })
}
