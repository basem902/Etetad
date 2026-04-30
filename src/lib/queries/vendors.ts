import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/types/database'

export type VendorRow = Tables<'vendors'>

export type VendorWithStats = VendorRow & {
  expenses_count: number
  total_amount: number
}

export type VendorsFilters = {
  specialty?: string
  /** When true, also include inactive vendors. */
  includeInactive?: boolean
}

export async function listVendors(
  buildingId: string,
  filters: VendorsFilters = {},
): Promise<VendorRow[]> {
  const supabase = await createClient()
  let q = supabase
    .from('vendors')
    .select('*')
    .eq('building_id', buildingId)
    .order('name')

  if (filters.specialty && filters.specialty !== 'all') {
    q = q.eq('specialty', filters.specialty)
  }
  if (!filters.includeInactive) {
    q = q.eq('is_active', true)
  }

  const { data } = await q
  return data ?? []
}

/** Distinct specialties for filter dropdown. */
export async function listVendorSpecialties(
  buildingId: string,
): Promise<string[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('vendors')
    .select('specialty')
    .eq('building_id', buildingId)
    .not('specialty', 'is', null)
  if (!data) return []
  const set = new Set<string>()
  for (const r of data) {
    const s = r.specialty?.trim()
    if (s) set.add(s)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'))
}

export async function getVendor(
  buildingId: string,
  vendorId: string,
): Promise<VendorRow | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('vendors')
    .select('*')
    .eq('building_id', buildingId)
    .eq('id', vendorId)
    .maybeSingle()
  return data ?? null
}

/** Expense history for a vendor (used on the detail page). */
export async function listVendorExpenses(
  buildingId: string,
  vendorId: string,
  limit = 50,
): Promise<
  {
    id: string
    title: string
    amount: number
    status: Tables<'expenses'>['status']
    expense_date: string
    created_at: string
  }[]
> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('expenses')
    .select('id, title, amount, status, expense_date, created_at')
    .eq('building_id', buildingId)
    .eq('vendor_id', vendorId)
    .order('expense_date', { ascending: false })
    .limit(limit)
  return data ?? []
}

/** Vendor with rolled-up stats (count + total amount of approved/paid expenses). */
export async function getVendorWithStats(
  buildingId: string,
  vendorId: string,
): Promise<VendorWithStats | null> {
  const vendor = await getVendor(buildingId, vendorId)
  if (!vendor) return null

  const supabase = await createClient()
  const { data } = await supabase
    .from('expenses')
    .select('amount, status')
    .eq('building_id', buildingId)
    .eq('vendor_id', vendorId)

  const rows = data ?? []
  const expenses_count = rows.length
  // Only count approved/paid in the total — drafts/rejected don't reflect actual spend.
  const total_amount = rows
    .filter((e) => e.status === 'approved' || e.status === 'paid')
    .reduce((sum, e) => sum + Number(e.amount), 0)

  return { ...vendor, expenses_count, total_amount }
}
