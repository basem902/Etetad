import { cookies } from 'next/headers'
import type { CookieOptions } from '@supabase/ssr'
import { createClient } from '@/lib/supabase/server'
import type { SubscriptionStatus } from '@/types/database'

const COOKIE_NAME = 'active_building_id'

const COOKIE_OPTIONS: Partial<CookieOptions> = {
  // Readable by client too (for the building-switcher UI).
  httpOnly: false,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: 60 * 60 * 24 * 365, // 1 year
}

export type UserBuilding = {
  building_id: string
  role:
    | 'admin'
    | 'treasurer'
    | 'committee'
    | 'resident'
    | 'technician'
  buildings: {
    id: string
    name: string
    subscription_status: SubscriptionStatus
  } | null
}

export async function getActiveBuildingId(): Promise<string | null> {
  const c = await cookies()
  return c.get(COOKIE_NAME)?.value ?? null
}

export async function setActiveBuildingId(buildingId: string) {
  const c = await cookies()
  c.set(COOKIE_NAME, buildingId, COOKIE_OPTIONS)
}

export async function clearActiveBuildingId() {
  const c = await cookies()
  c.delete(COOKIE_NAME)
}

/**
 * Fetch the buildings the current user is an active member of.
 * RLS ensures cross-tenant isolation: the user only sees their own.
 *
 * We deliberately split this into two queries instead of using a nested
 * `select('..., buildings(id, name)')` because the hand-crafted Database type
 * has empty Relationships arrays. Once types are auto-generated from a real
 * Supabase project, this can be a single nested select.
 */
export async function getUserBuildings(userId: string): Promise<UserBuilding[]> {
  const supabase = await createClient()
  const { data: memberships } = await supabase
    .from('building_memberships')
    .select('building_id, role')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  if (!memberships || memberships.length === 0) return []

  const buildingIds = memberships.map((m) => m.building_id)
  const { data: buildings } = await supabase
    .from('buildings')
    .select('id, name, subscription_status')
    .in('id', buildingIds)

  const buildingsMap = new Map(
    (buildings ?? []).map(
      (b) =>
        [
          b.id,
          {
            id: b.id,
            name: b.name,
            subscription_status: b.subscription_status,
          },
        ] as const,
    ),
  )

  return memberships.map(
    (m): UserBuilding => ({
      building_id: m.building_id,
      role: m.role,
      buildings: buildingsMap.get(m.building_id) ?? null,
    }),
  )
}

/**
 * Ensure there is a valid active building cookie for the user.
 * If the cookie points to a building the user is no longer a member of
 * (or no cookie at all), pick the first active membership and set it.
 *
 * Phase 14 (round 2 P1 fix): mirror middleware's subscription-aware
 * fallback. If the cookie points to a building whose subscription is
 * 'expired' or 'cancelled' BUT the user has other active-subscription
 * memberships, prefer those. Only return the inactive cookie if it's
 * the user's only option (so middleware can rewrite to /subscription-inactive
 * with a useful message instead of a loop).
 *
 * Returns null if the user has no buildings.
 */
export async function ensureActiveBuilding(userId: string): Promise<string | null> {
  const current = await getActiveBuildingId()

  if (current) {
    const supabase = await createClient()
    const { data: membership } = await supabase
      .from('building_memberships')
      .select('building_id')
      .eq('user_id', userId)
      .eq('building_id', current)
      .eq('is_active', true)
      .maybeSingle()

    if (membership) {
      // Phase 14: also confirm the building's subscription is still active.
      // If it's expired/cancelled and the user has another active building,
      // we want to switch — middleware does this already on every request,
      // and we want layout-level reads to agree.
      const { data: building } = await supabase
        .from('buildings')
        .select('subscription_status')
        .eq('id', current)
        .maybeSingle()

      const isCookieActive =
        building &&
        building.subscription_status !== 'expired' &&
        building.subscription_status !== 'cancelled'

      if (isCookieActive) return current
      // Cookie is inactive — fall through and try a better one. Only if
      // there's no better option do we return the inactive cookie.
    } else {
      // membership no longer valid — clear and pick fresh
      await clearActiveBuildingId()
    }
  }

  const buildings = await getUserBuildings(userId)
  if (buildings.length === 0) return null

  // Prefer non-expired/non-cancelled buildings (matches middleware fallback).
  const isActiveSub = (b: UserBuilding) =>
    b.buildings?.subscription_status !== 'expired' &&
    b.buildings?.subscription_status !== 'cancelled'

  const preferred = buildings.find(isActiveSub) ?? buildings[0]
  const first = preferred?.building_id
  if (!first) return null
  await setActiveBuildingId(first)
  return first
}
