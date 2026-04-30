import { createClient } from '@/lib/supabase/server'
import type {
  SubscriptionPlan,
  SubscriptionStatus,
  Tables,
} from '@/types/database'

export type PlatformStats = {
  total_buildings: number
  trial_buildings: number
  active_buildings: number
  expired_buildings: number
  cancelled_buildings: number
  total_users: number
  total_apartments: number
  total_payments_approved: number
  trials_expiring_soon: number
}

export async function getPlatformStats(): Promise<PlatformStats | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_stats')
  if (error) return null
  const row = (data ?? [])[0]
  if (!row) return null
  return {
    total_buildings: Number(row.total_buildings),
    trial_buildings: Number(row.trial_buildings),
    active_buildings: Number(row.active_buildings),
    expired_buildings: Number(row.expired_buildings),
    cancelled_buildings: Number(row.cancelled_buildings),
    total_users: Number(row.total_users),
    total_apartments: Number(row.total_apartments),
    total_payments_approved: Number(row.total_payments_approved),
    trials_expiring_soon: Number(row.trials_expiring_soon),
  }
}

export type BuildingRow = Tables<'buildings'>

export type BuildingsFilters = {
  status?: SubscriptionStatus
  plan?: SubscriptionPlan
  q?: string
}

export async function listAllBuildings(
  filters: BuildingsFilters = {},
): Promise<BuildingRow[]> {
  // super_admin RLS clause on buildings_select_member_or_super lets the call go
  // through. Caller must be super_admin (enforced at the route level).
  const supabase = await createClient()
  let q = supabase
    .from('buildings')
    .select('*')
    .order('created_at', { ascending: false })

  if (filters.status) q = q.eq('subscription_status', filters.status)
  if (filters.plan) q = q.eq('subscription_plan', filters.plan)
  if (filters.q && filters.q.trim()) {
    q = q.ilike('name', `%${filters.q.trim()}%`)
  }
  const { data } = await q
  return data ?? []
}

export async function getBuildingDetail(buildingId: string): Promise<{
  building: BuildingRow | null
  usage: {
    apartments_count: number
    members_count: number
    pending_payments_count: number
    approved_payments_total: number
    paid_expenses_total: number
    open_maintenance_count: number
    active_votes_count: number
    last_activity_at: string | null
  } | null
}> {
  const supabase = await createClient()
  const [{ data: building }, { data: usageRows }] = await Promise.all([
    supabase
      .from('buildings')
      .select('*')
      .eq('id', buildingId)
      .maybeSingle(),
    supabase.rpc('building_usage_detail', { p_building_id: buildingId }),
  ])

  const usageRow = (usageRows ?? [])[0]
  return {
    building: building ?? null,
    usage: usageRow
      ? {
          apartments_count: Number(usageRow.apartments_count),
          members_count: Number(usageRow.members_count),
          pending_payments_count: Number(usageRow.pending_payments_count),
          approved_payments_total: Number(usageRow.approved_payments_total),
          paid_expenses_total: Number(usageRow.paid_expenses_total),
          open_maintenance_count: Number(usageRow.open_maintenance_count),
          active_votes_count: Number(usageRow.active_votes_count),
          last_activity_at: usageRow.last_activity_at,
        }
      : null,
  }
}

export type PlatformUserRow = Tables<'profiles'> & {
  email: string | null
  buildings_count: number
}

export async function listAllUsers(filters: { q?: string } = {}): Promise<PlatformUserRow[]> {
  const supabase = await createClient()

  // profiles is RLS-locked to self + same-building members + super_admin.
  // super_admin sees all.
  let q = supabase.from('profiles').select('*').order('created_at', { ascending: false })
  if (filters.q && filters.q.trim()) {
    q = q.ilike('full_name', `%${filters.q.trim()}%`)
  }
  const { data: profiles } = await q
  if (!profiles || profiles.length === 0) return []

  // Memberships count per user (cross-tenant)
  const userIds = profiles.map((p) => p.id)
  const { data: memberships } = await supabase
    .from('building_memberships')
    .select('user_id')
    .in('user_id', userIds)
    .eq('is_active', true)

  const counts = new Map<string, number>()
  for (const m of memberships ?? []) {
    counts.set(m.user_id, (counts.get(m.user_id) ?? 0) + 1)
  }

  return profiles.map((p) => ({
    ...p,
    email: null, // emails live in auth.users; super_admin can see via separate query if needed
    buildings_count: counts.get(p.id) ?? 0,
  }))
}

export type PlatformAuditEntry = {
  id: string
  building_id: string | null
  building_name: string | null
  action: string
  entity_type: string
  entity_id: string | null
  actor_id: string | null
  actor_name: string | null
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  notes: string | null
  created_at: string
}

export async function listPlatformAudit(filters: {
  entityType?: string
  buildingId?: string
  before?: string
  pageSize?: number
} = {}): Promise<{ rows: PlatformAuditEntry[]; nextCursor: string | null }> {
  const pageSize = Math.min(100, filters.pageSize ?? 50)
  const supabase = await createClient()

  let q = supabase
    .from('audit_logs')
    .select('id, building_id, action, entity_type, entity_id, actor_id, old_values, new_values, notes, created_at')
    .order('created_at', { ascending: false })
    .limit(pageSize + 1)

  if (filters.entityType && filters.entityType !== 'all') q = q.eq('entity_type', filters.entityType)
  if (filters.buildingId && filters.buildingId !== 'all') q = q.eq('building_id', filters.buildingId)
  if (filters.before) q = q.lt('created_at', filters.before)

  const { data, error } = await q
  if (error || !data) return { rows: [], nextCursor: null }

  const hasMore = data.length > pageSize
  const sliced = hasMore ? data.slice(0, pageSize) : data

  const buildingIds = Array.from(
    new Set(sliced.map((r) => r.building_id).filter((x): x is string => Boolean(x))),
  )
  const actorIds = Array.from(
    new Set(sliced.map((r) => r.actor_id).filter((x): x is string => Boolean(x))),
  )

  const [{ data: buildings }, { data: actors }] = await Promise.all([
    buildingIds.length > 0
      ? supabase.from('buildings').select('id, name').in('id', buildingIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    actorIds.length > 0
      ? supabase.from('profiles').select('id, full_name').in('id', actorIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ])

  const bMap = new Map((buildings ?? []).map((b) => [b.id, b.name] as const))
  const aMap = new Map((actors ?? []).map((a) => [a.id, a.full_name] as const))

  const rows: PlatformAuditEntry[] = sliced.map((r) => ({
    id: r.id,
    building_id: r.building_id,
    building_name: r.building_id ? bMap.get(r.building_id) ?? null : null,
    action: r.action,
    entity_type: r.entity_type,
    entity_id: r.entity_id,
    actor_id: r.actor_id,
    actor_name: r.actor_id ? aMap.get(r.actor_id) ?? null : null,
    old_values: (r.old_values ?? null) as Record<string, unknown> | null,
    new_values: (r.new_values ?? null) as Record<string, unknown> | null,
    notes: r.notes,
    created_at: r.created_at,
  }))

  const nextCursor = hasMore ? sliced[sliced.length - 1]!.created_at : null
  return { rows, nextCursor }
}
