import { createClient } from '@/lib/supabase/server'
import type {
  MaintenanceLocation,
  MaintenancePriority,
  MaintenanceStatus,
  Tables,
} from '@/types/database'

export type MaintenanceRow = Tables<'maintenance_requests'> & {
  apartment_number: string | null
  requester_name: string | null
  assignee_name: string | null
}

export type MaintenanceFilters = {
  status?: MaintenanceStatus
  priority?: MaintenancePriority
  locationType?: MaintenanceLocation
  assignedTo?: string
  page?: number
  pageSize?: number
}

const DEFAULT_PAGE_SIZE = 20

async function enrich(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: Tables<'maintenance_requests'>[],
): Promise<MaintenanceRow[]> {
  if (rows.length === 0) return []

  const aptIds = Array.from(
    new Set(rows.map((r) => r.apartment_id).filter((x): x is string => Boolean(x))),
  )
  const userIds = Array.from(
    new Set(
      rows.flatMap((r) =>
        [r.requested_by, r.assigned_to].filter((x): x is string => Boolean(x)),
      ),
    ),
  )

  const [{ data: apts }, { data: profiles }] = await Promise.all([
    aptIds.length > 0
      ? supabase.from('apartments').select('id, number').in('id', aptIds)
      : Promise.resolve({ data: [] as { id: string; number: string }[] }),
    userIds.length > 0
      ? supabase.from('profiles').select('id, full_name').in('id', userIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ])

  const aptMap = new Map((apts ?? []).map((a) => [a.id, a.number] as const))
  const profMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name] as const))

  return rows.map((r) => ({
    ...r,
    apartment_number: r.apartment_id ? aptMap.get(r.apartment_id) ?? null : null,
    requester_name: r.requested_by ? profMap.get(r.requested_by) ?? null : null,
    assignee_name: r.assigned_to ? profMap.get(r.assigned_to) ?? null : null,
  }))
}

export async function listMaintenanceRequests(
  buildingId: string,
  filters: MaintenanceFilters = {},
): Promise<{ rows: MaintenanceRow[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const supabase = await createClient()

  let q = supabase
    .from('maintenance_requests')
    .select('*', { count: 'exact' })
    .eq('building_id', buildingId)
    .order('created_at', { ascending: false })

  if (filters.status) q = q.eq('status', filters.status)
  if (filters.priority) q = q.eq('priority', filters.priority)
  if (filters.locationType) q = q.eq('location_type', filters.locationType)
  if (filters.assignedTo) q = q.eq('assigned_to', filters.assignedTo)

  q = q.range(from, to)

  const { data, count, error } = await q
  if (error || !data) {
    return { rows: [], total: 0, page, pageSize }
  }

  const rows = await enrich(supabase, data)
  return { rows, total: count ?? rows.length, page, pageSize }
}

export async function getMaintenanceRequest(
  buildingId: string,
  id: string,
): Promise<MaintenanceRow | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('maintenance_requests')
    .select('*')
    .eq('building_id', buildingId)
    .eq('id', id)
    .maybeSingle()
  if (!data) return null
  const enriched = await enrich(supabase, [data])
  return enriched[0] ?? null
}

/**
 * Building members with role='technician' — for the assign dropdown.
 * RLS allows admin/committee to read building_memberships.
 */
export async function listTechnicians(
  buildingId: string,
): Promise<{ user_id: string; full_name: string | null }[]> {
  const supabase = await createClient()
  const { data: memberships } = await supabase
    .from('building_memberships')
    .select('user_id')
    .eq('building_id', buildingId)
    .eq('role', 'technician')
    .eq('is_active', true)
  if (!memberships || memberships.length === 0) return []

  const userIds = memberships.map((m) => m.user_id)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds)
  const map = new Map((profiles ?? []).map((p) => [p.id, p.full_name] as const))
  return userIds.map((id) => ({ user_id: id, full_name: map.get(id) ?? null }))
}

/** Apartments in the building — for the new-request form dropdown. */
export async function listApartmentsForMaintenance(
  buildingId: string,
): Promise<{ id: string; number: string }[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('apartments')
    .select('id, number')
    .eq('building_id', buildingId)
    .order('number')
  return data ?? []
}

/**
 * Audit log entries for a single maintenance request — drives the timeline.
 * Returns oldest-first so the UI can render them top-to-bottom.
 */
export type MaintenanceTimelineEntry = {
  id: string
  action: string
  actor_id: string | null
  actor_name: string | null
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  created_at: string
}

export async function listMaintenanceTimeline(
  buildingId: string,
  requestId: string,
): Promise<MaintenanceTimelineEntry[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('audit_logs')
    .select('id, action, actor_id, old_values, new_values, created_at')
    .eq('building_id', buildingId)
    .eq('entity_type', 'maintenance_requests')
    .eq('entity_id', requestId)
    .order('created_at', { ascending: true })
    .limit(200)

  if (!data || data.length === 0) return []

  const actorIds = Array.from(
    new Set(data.map((a) => a.actor_id).filter((x): x is string => Boolean(x))),
  )
  const profMap = new Map<string, string | null>()
  if (actorIds.length > 0) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', actorIds)
    for (const p of profs ?? []) profMap.set(p.id, p.full_name)
  }

  return data.map((row) => ({
    id: row.id,
    action: row.action,
    actor_id: row.actor_id,
    actor_name: row.actor_id ? profMap.get(row.actor_id) ?? null : null,
    old_values: (row.old_values ?? null) as Record<string, unknown> | null,
    new_values: (row.new_values ?? null) as Record<string, unknown> | null,
    created_at: row.created_at,
  }))
}
