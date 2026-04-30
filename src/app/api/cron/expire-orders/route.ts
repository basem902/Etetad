import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Daily cron: expires subscription_orders stuck in `awaiting_payment` > 30 days.
 *
 * Vercel Cron config (in vercel.json):
 *   { "path": "/api/cron/expire-orders", "schedule": "0 2 * * *" }
 *
 * Auth: CRON_SECRET header — anon GET → 401.
 */
export async function POST(req: NextRequest) {
  return handle(req)
}

export async function GET(req: NextRequest) {
  return handle(req)
}

async function handle(req: NextRequest) {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`
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

  // Find stale awaiting_payment orders (> 30 days)
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: stale, error: fetchErr } = await admin
    .from('subscription_orders')
    .select('id')
    .eq('status', 'awaiting_payment')
    .lt('created_at', cutoff)

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  // Direct UPDATE via service_role (bypasses RLS but we need to flip status).
  // Workflow trigger validates: awaiting_payment → expired is on the whitelist.
  let expiredCount = 0
  for (const row of stale ?? []) {
    const { error: updateErr } = await admin
      .from('subscription_orders')
      .update({ status: 'expired' })
      .eq('id', row.id)
    if (!updateErr) expiredCount++
  }

  return NextResponse.json({
    success: true,
    candidates: stale?.length ?? 0,
    expired: expiredCount,
  })
}
