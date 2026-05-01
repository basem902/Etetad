import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  ensureActiveBuilding,
  getUserBuildings,
  getActiveBuildingId,
} from '@/lib/tenant'
import { isSuperAdmin } from '@/lib/permissions'
import { AppShell } from '@/components/layout/app-shell'

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const buildings = await getUserBuildings(user.id)

  // No buildings → could be:
  //   - super_admin (no memberships expected) → /super-admin
  //   - pending-only user (signed up via /join, awaiting admin approval) → /account/pending
  //   - genuinely new user → /onboarding (register their own building)
  //
  // Phase 17 (lesson #16 path-aware fallback): users with a pending request in
  // building B AND active membership in A get cookie-switched to A by the Phase
  // 14 round-3 logic — they end up here only if they have ZERO active memberships
  // anywhere. Then we choose between pending vs onboarding based on whether
  // they have any pending row.
  if (buildings.length === 0) {
    if (await isSuperAdmin(user.id)) redirect('/super-admin')

    // Phase 17: pending join request as a resident (existing pattern)
    const { data: pendingJoin } = await supabase
      .from('pending_apartment_members')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .limit(1)
    if (pendingJoin && pendingJoin.length > 0) {
      redirect('/account/pending')
    }

    // v0.20: pending subscription order as a new building admin (password
    // upfront, awaiting super_admin approval). Same /account/pending page,
    // different message section. RPC scopes by auth.uid() server-side.
    const { data: pendingSubs } = await supabase.rpc(
      'get_my_pending_subscription_orders',
    )
    if (pendingSubs && pendingSubs.length > 0) {
      redirect('/account/pending')
    }

    redirect('/onboarding')
  }

  await ensureActiveBuilding(user.id)
  const activeBuildingId = await getActiveBuildingId()

  // Resolve active building name + current role for sidebar/header context.
  const active = buildings.find((b) => b.building_id === activeBuildingId) ?? buildings[0]!
  const activeBuildingName = active.buildings?.name ?? null
  const role = active.role

  // Phase 14: defense-in-depth subscription gate.
  //   Middleware already rewrites expired/cancelled buildings to
  //   /subscription-inactive, but a request that bypasses middleware (e.g.
  //   prefetch quirks) lands here. super_admin keeps access for support.
  const status = active.buildings?.subscription_status
  if (
    (status === 'expired' || status === 'cancelled') &&
    !(await isSuperAdmin(user.id))
  ) {
    redirect('/subscription-inactive')
  }

  // Pull profile.full_name (user_metadata may not have it yet).
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle()

  return (
    <AppShell
      user={user}
      buildings={buildings}
      activeBuildingId={activeBuildingId}
      activeBuildingName={activeBuildingName}
      role={role}
      fullName={profile?.full_name ?? null}
    >
      {children}
    </AppShell>
  )
}
