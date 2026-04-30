import { createClient } from '@/lib/supabase/server'
import type { TaskPriority, TaskStatus, Tables } from '@/types/database'

/**
 * Task row enriched with assignee profile + a derived `is_overdue` flag.
 * 'overdue' is NOT stored — it's computed from due_date < today AND status not 'completed'.
 */
export type TaskRow = Tables<'tasks'> & {
  assignee_name: string | null
  created_by_name: string | null
  is_overdue: boolean
}

export type TaskFilters = {
  status?: TaskStatus
  priority?: TaskPriority
  assignedTo?: string
  /** When true, only return tasks past due_date and not completed. */
  overdueOnly?: boolean
}

function computeOverdue(row: Tables<'tasks'>): boolean {
  if (!row.due_date) return false
  if (row.status === 'completed') return false
  // Compare YYYY-MM-DD strings — Postgres stores `date` like that.
  const today = new Date().toISOString().slice(0, 10)
  return row.due_date < today
}

async function enrich(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: Tables<'tasks'>[],
): Promise<TaskRow[]> {
  if (rows.length === 0) return []
  const userIds = Array.from(
    new Set(
      rows.flatMap((r) =>
        [r.assigned_to, r.created_by].filter((x): x is string => Boolean(x)),
      ),
    ),
  )
  const { data: profiles } =
    userIds.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', userIds)
      : { data: [] as { id: string; full_name: string | null }[] }
  const map = new Map((profiles ?? []).map((p) => [p.id, p.full_name] as const))

  return rows.map((r) => ({
    ...r,
    assignee_name: r.assigned_to ? map.get(r.assigned_to) ?? null : null,
    created_by_name: r.created_by ? map.get(r.created_by) ?? null : null,
    is_overdue: computeOverdue(r),
  }))
}

export async function listTasks(
  buildingId: string,
  filters: TaskFilters = {},
): Promise<TaskRow[]> {
  const supabase = await createClient()
  let q = supabase
    .from('tasks')
    .select('*')
    .eq('building_id', buildingId)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (filters.status) q = q.eq('status', filters.status)
  if (filters.priority) q = q.eq('priority', filters.priority)
  if (filters.assignedTo) q = q.eq('assigned_to', filters.assignedTo)

  const { data } = await q
  if (!data) return []

  const enriched = await enrich(supabase, data)
  return filters.overdueOnly ? enriched.filter((t) => t.is_overdue) : enriched
}

export async function getTask(
  buildingId: string,
  id: string,
): Promise<TaskRow | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('tasks')
    .select('*')
    .eq('building_id', buildingId)
    .eq('id', id)
    .maybeSingle()
  if (!data) return null
  const enriched = await enrich(supabase, [data])
  return enriched[0] ?? null
}

/** Building members eligible to be task-assignees (admin/committee/treasurer). */
export async function listTaskAssignees(
  buildingId: string,
): Promise<{ user_id: string; full_name: string | null; role: string }[]> {
  const supabase = await createClient()
  const { data: memberships } = await supabase
    .from('building_memberships')
    .select('user_id, role')
    .eq('building_id', buildingId)
    .in('role', ['admin', 'committee', 'treasurer'])
    .eq('is_active', true)
  if (!memberships || memberships.length === 0) return []

  const userIds = memberships.map((m) => m.user_id)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds)
  const profMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name] as const))
  return memberships.map((m) => ({
    user_id: m.user_id,
    full_name: profMap.get(m.user_id) ?? null,
    role: m.role,
  }))
}
