import { createClient } from '@/lib/supabase/server'
import type { MembershipRole } from '@/types/database'

export class UnauthenticatedError extends Error {
  constructor() {
    super('UNAUTHENTICATED')
    this.name = 'UnauthenticatedError'
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'FORBIDDEN') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

export async function getCurrentUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) throw new UnauthenticatedError()
  return user
}

export async function isSuperAdmin(userId?: string): Promise<boolean> {
  const supabase = await createClient()
  const id = userId ?? (await getCurrentUser())?.id
  if (!id) return false

  const { data } = await supabase
    .from('profiles')
    .select('is_super_admin')
    .eq('id', id)
    .maybeSingle()

  return data?.is_super_admin ?? false
}

export async function getMembership(
  buildingId: string,
  userId?: string,
) {
  const supabase = await createClient()
  const id = userId ?? (await getCurrentUser())?.id
  if (!id) return null

  const { data } = await supabase
    .from('building_memberships')
    .select('role, is_active, building_id, user_id')
    .eq('building_id', buildingId)
    .eq('user_id', id)
    .eq('is_active', true)
    .maybeSingle()

  return data
}

export async function hasRole(
  buildingId: string,
  roles: MembershipRole[],
  userId?: string,
): Promise<boolean> {
  const m = await getMembership(buildingId, userId)
  if (!m) return false
  return roles.includes(m.role)
}

/**
 * Throws ForbiddenError if the current user lacks any of the required roles
 * in the given building. Super admin always passes.
 */
export async function requireRole(
  buildingId: string,
  roles: MembershipRole[],
) {
  const user = await requireUser()
  if (await isSuperAdmin(user.id)) return user
  if (await hasRole(buildingId, roles, user.id)) return user
  throw new ForbiddenError()
}

export async function requireSuperAdmin() {
  const user = await requireUser()
  if (!(await isSuperAdmin(user.id))) throw new ForbiddenError()
  return user
}
