import { createClient } from '@/lib/supabase/server'
import type {
  PaymentMethod,
  PaymentStatus,
  Tables,
} from '@/types/database'

export type PaymentRow = Tables<'payments'> & {
  apartment_number: string | null
  user_name: string | null
  created_by_name: string | null
  approved_by_name: string | null
}

export type PaymentsFilters = {
  status?: PaymentStatus
  method?: PaymentMethod
  apartmentId?: string
  /** YYYY-MM-01 — exact period_month match (single month). */
  periodMonth?: string
  page?: number
  pageSize?: number
}

const DEFAULT_PAGE_SIZE = 20

async function enrich(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: Tables<'payments'>[],
): Promise<PaymentRow[]> {
  if (rows.length === 0) return []

  const aptIds = Array.from(new Set(rows.map((r) => r.apartment_id)))
  const userIds = Array.from(
    new Set(
      rows.flatMap((r) =>
        [r.user_id, r.created_by, r.approved_by].filter((x): x is string => Boolean(x)),
      ),
    ),
  )

  const [{ data: apts }, { data: profiles }] = await Promise.all([
    supabase.from('apartments').select('id, number').in('id', aptIds),
    userIds.length > 0
      ? supabase.from('profiles').select('id, full_name').in('id', userIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ])

  const aptMap = new Map((apts ?? []).map((a) => [a.id, a.number] as const))
  const profMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name] as const))

  return rows.map((r) => ({
    ...r,
    apartment_number: aptMap.get(r.apartment_id) ?? null,
    user_name: r.user_id ? profMap.get(r.user_id) ?? null : null,
    created_by_name: r.created_by ? profMap.get(r.created_by) ?? null : null,
    approved_by_name: r.approved_by ? profMap.get(r.approved_by) ?? null : null,
  }))
}

export async function listPayments(
  buildingId: string,
  filters: PaymentsFilters = {},
): Promise<{ rows: PaymentRow[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const supabase = await createClient()

  let q = supabase
    .from('payments')
    .select('*', { count: 'exact' })
    .eq('building_id', buildingId)
    .order('created_at', { ascending: false })

  if (filters.status) q = q.eq('status', filters.status)
  if (filters.method) q = q.eq('method', filters.method)
  if (filters.apartmentId) q = q.eq('apartment_id', filters.apartmentId)
  if (filters.periodMonth) q = q.eq('period_month', filters.periodMonth)

  q = q.range(from, to)

  const { data, count, error } = await q
  if (error || !data) {
    return { rows: [], total: 0, page, pageSize }
  }

  const rows = await enrich(supabase, data)
  return { rows, total: count ?? rows.length, page, pageSize }
}

export async function listPendingPayments(
  buildingId: string,
  limit = 10,
): Promise<PaymentRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('payments')
    .select('*')
    .eq('building_id', buildingId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit)
  if (!data) return []
  return enrich(supabase, data)
}

export async function getPayment(
  buildingId: string,
  paymentId: string,
): Promise<PaymentRow | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('payments')
    .select('*')
    .eq('building_id', buildingId)
    .eq('id', paymentId)
    .maybeSingle()
  if (!data) return null
  const enriched = await enrich(supabase, [data])
  return enriched[0] ?? null
}

/**
 * For the payment-form's apartment selector. Treasurer/admin see all building
 * apartments; residents see only their own apartments.
 */
export async function listApartmentsForPayment(
  buildingId: string,
  userId: string,
  isPrivileged: boolean,
): Promise<{ id: string; number: string }[]> {
  const supabase = await createClient()
  if (isPrivileged) {
    const { data } = await supabase
      .from('apartments')
      .select('id, number')
      .eq('building_id', buildingId)
      .order('number')
    return data ?? []
  }
  const { data: members } = await supabase
    .from('apartment_members')
    .select('apartment_id')
    .eq('user_id', userId)
    .eq('building_id', buildingId)
    .eq('is_active', true)
  const aptIds = (members ?? []).map((m) => m.apartment_id)
  if (aptIds.length === 0) return []
  const { data } = await supabase
    .from('apartments')
    .select('id, number')
    .in('id', aptIds)
    .order('number')
  return data ?? []
}
