import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Daily cron: expires buildings whose subscription_ends_at < now (and still
 * status='active'). Uses Phase 14's update_building_subscription RPC which
 * enforces the active → expired transition whitelist.
 *
 * Vercel Cron config (in vercel.json):
 *   { "path": "/api/cron/expire-subscriptions", "schedule": "5 2 * * *" }
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

  // v3.40 (Codex round 3 P2 #2 + #3):
  //   - Calls the narrow `expire_due_subscriptions()` RPC instead of direct
  //     service_role UPDATE. The RPC uses an unforgeable private-schema
  //     marker (Phase 8 lesson #6) so the Phase 14 trigger only allows the
  //     bypass for THIS specific transaction — not for any service_role
  //     update of subscription fields.
  //   - The RPC also preserves `subscription_ends_at` (the contractual end
  //     date). The previous direct UPDATE was overwriting it with `now()`,
  //     destroying the audit trail. Reports/support now keep the original
  //     contract end date alongside `subscription_status='expired'`.
  const { data: expiredCount, error: rpcErr } = await admin.rpc(
    'expire_due_subscriptions',
  )

  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    expired: typeof expiredCount === 'number' ? expiredCount : 0,
  })
}
