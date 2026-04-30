import { createClient } from '@/lib/supabase/server'
import type { ExpenseStatus, Tables } from '@/types/database'

export type ExpenseRow = Tables<'expenses'> & {
  vendor_name: string | null
  created_by_name: string | null
  approved_by_name: string | null
  paid_by_name: string | null
}

export type ExpensesFilters = {
  status?: ExpenseStatus
  category?: string
  vendorId?: string
  /** YYYY-MM-DD inclusive */
  dateFrom?: string
  /** YYYY-MM-DD inclusive */
  dateTo?: string
  page?: number
  pageSize?: number
}

const DEFAULT_PAGE_SIZE = 20

async function enrich(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: Tables<'expenses'>[],
): Promise<ExpenseRow[]> {
  if (rows.length === 0) return []

  const vendorIds = Array.from(
    new Set(rows.map((r) => r.vendor_id).filter((x): x is string => Boolean(x))),
  )
  const userIds = Array.from(
    new Set(
      rows.flatMap((r) =>
        [r.created_by, r.approved_by, r.paid_by].filter((x): x is string => Boolean(x)),
      ),
    ),
  )

  const [{ data: vendors }, { data: profiles }] = await Promise.all([
    vendorIds.length > 0
      ? supabase.from('vendors').select('id, name').in('id', vendorIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    userIds.length > 0
      ? supabase.from('profiles').select('id, full_name').in('id', userIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ])

  const vendorMap = new Map((vendors ?? []).map((v) => [v.id, v.name] as const))
  const profMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name] as const))

  return rows.map((r) => ({
    ...r,
    vendor_name: r.vendor_id ? vendorMap.get(r.vendor_id) ?? null : null,
    created_by_name: r.created_by ? profMap.get(r.created_by) ?? null : null,
    approved_by_name: r.approved_by ? profMap.get(r.approved_by) ?? null : null,
    paid_by_name: r.paid_by ? profMap.get(r.paid_by) ?? null : null,
  }))
}

export async function listExpenses(
  buildingId: string,
  filters: ExpensesFilters = {},
): Promise<{ rows: ExpenseRow[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const supabase = await createClient()

  let q = supabase
    .from('expenses')
    .select('*', { count: 'exact' })
    .eq('building_id', buildingId)
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (filters.status) q = q.eq('status', filters.status)
  if (filters.category) q = q.eq('category', filters.category)
  if (filters.vendorId) q = q.eq('vendor_id', filters.vendorId)
  if (filters.dateFrom) q = q.gte('expense_date', filters.dateFrom)
  if (filters.dateTo) q = q.lte('expense_date', filters.dateTo)

  q = q.range(from, to)

  const { data, count, error } = await q
  if (error || !data) {
    return { rows: [], total: 0, page, pageSize }
  }

  const rows = await enrich(supabase, data)
  return { rows, total: count ?? rows.length, page, pageSize }
}

export async function listPendingExpenses(
  buildingId: string,
  limit = 10,
): Promise<ExpenseRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('expenses')
    .select('*')
    .eq('building_id', buildingId)
    .eq('status', 'pending_review')
    .order('created_at', { ascending: true })
    .limit(limit)
  if (!data) return []
  return enrich(supabase, data)
}

export async function getExpense(
  buildingId: string,
  expenseId: string,
): Promise<ExpenseRow | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('expenses')
    .select('*')
    .eq('building_id', buildingId)
    .eq('id', expenseId)
    .maybeSingle()
  if (!data) return null
  const enriched = await enrich(supabase, [data])
  return enriched[0] ?? null
}

/** All vendors in the building, for the expense form dropdown. */
export async function listVendorsForBuilding(
  buildingId: string,
): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('vendors')
    .select('id, name')
    .eq('building_id', buildingId)
    .eq('is_active', true)
    .order('name')
  return data ?? []
}

/** Distinct non-empty categories already used in this building (suggestions). */
export async function listExpenseCategories(buildingId: string): Promise<string[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('expenses')
    .select('category')
    .eq('building_id', buildingId)
    .not('category', 'is', null)
    .limit(500)
  if (!data) return []
  const set = new Set<string>()
  for (const row of data) {
    const c = row.category?.trim()
    if (c) set.add(c)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'))
}
