import { createClient } from '@/lib/supabase/server'

// =============================================
// Phase 11 — Audit logs queries
// =============================================
// audit_logs table is admin/committee-only via RLS. The page enforces this
// at the route level too.

export type AuditEntry = {
  id: string
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

export type AuditFilters = {
  entityType?: string
  action?: string
  actorId?: string
  /** YYYY-MM-DD inclusive */
  dateFrom?: string
  /** YYYY-MM-DD inclusive */
  dateTo?: string
  /** Cursor: ISO timestamp; returns rows STRICTLY OLDER than this. */
  before?: string
  pageSize?: number
}

const DEFAULT_PAGE_SIZE = 50

/**
 * Cursor pagination via `before` timestamp (newest-first). Stable across
 * inserts (audit table is append-only) and indexed via idx_audit_created.
 */
export async function listAuditLogs(
  buildingId: string,
  filters: AuditFilters = {},
): Promise<{
  rows: AuditEntry[]
  /** Pass this back as `before` to fetch the next (older) page. null = end. */
  nextCursor: string | null
  pageSize: number
}> {
  const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE))
  const supabase = await createClient()

  let q = supabase
    .from('audit_logs')
    .select('id, action, entity_type, entity_id, actor_id, old_values, new_values, notes, created_at')
    .eq('building_id', buildingId)
    .order('created_at', { ascending: false })
    .limit(pageSize + 1) // fetch one extra to detect more

  if (filters.entityType && filters.entityType !== 'all') {
    q = q.eq('entity_type', filters.entityType)
  }
  if (filters.action && filters.action !== 'all') {
    q = q.eq('action', filters.action)
  }
  if (filters.actorId) {
    q = q.eq('actor_id', filters.actorId)
  }
  if (filters.dateFrom) q = q.gte('created_at', `${filters.dateFrom}T00:00:00Z`)
  if (filters.dateTo) q = q.lte('created_at', `${filters.dateTo}T23:59:59Z`)
  if (filters.before) q = q.lt('created_at', filters.before)

  const { data, error } = await q
  if (error || !data) {
    return { rows: [], nextCursor: null, pageSize }
  }

  // Detect more results
  const hasMore = data.length > pageSize
  const sliced = hasMore ? data.slice(0, pageSize) : data

  // Enrich actor names
  const actorIds = Array.from(
    new Set(sliced.map((r) => r.actor_id).filter((x): x is string => Boolean(x))),
  )
  const profMap = new Map<string, string | null>()
  if (actorIds.length > 0) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', actorIds)
    for (const p of profs ?? []) profMap.set(p.id, p.full_name)
  }

  const rows: AuditEntry[] = sliced.map((r) => ({
    id: r.id,
    action: r.action,
    entity_type: r.entity_type,
    entity_id: r.entity_id,
    actor_id: r.actor_id,
    actor_name: r.actor_id ? profMap.get(r.actor_id) ?? null : null,
    old_values: (r.old_values ?? null) as Record<string, unknown> | null,
    new_values: (r.new_values ?? null) as Record<string, unknown> | null,
    notes: r.notes,
    created_at: r.created_at,
  }))

  const nextCursor = hasMore ? sliced[sliced.length - 1]!.created_at : null

  return { rows, nextCursor, pageSize }
}

/** Distinct entity_type values present in this building's audit log. */
export async function listAuditEntityTypes(buildingId: string): Promise<string[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('audit_logs')
    .select('entity_type')
    .eq('building_id', buildingId)
    .limit(1000)
  if (!data) return []
  return Array.from(new Set(data.map((r) => r.entity_type))).sort()
}

/** Distinct actor user_ids with names, for the actor filter dropdown. */
export async function listAuditActors(
  buildingId: string,
): Promise<{ id: string; name: string | null }[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('audit_logs')
    .select('actor_id')
    .eq('building_id', buildingId)
    .not('actor_id', 'is', null)
    .limit(1000)
  if (!data || data.length === 0) return []
  const ids = Array.from(new Set(data.map((r) => r.actor_id).filter((x): x is string => Boolean(x))))
  if (ids.length === 0) return []
  const { data: profs } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', ids)
  const map = new Map((profs ?? []).map((p) => [p.id, p.full_name] as const))
  return ids.map((id) => ({ id, name: map.get(id) ?? null }))
}
