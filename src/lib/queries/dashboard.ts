import { createClient } from '@/lib/supabase/server'
import {
  periodMonthString,
  nextMonthString,
  lastNMonthKeys,
} from '@/lib/format'
import type {
  PaymentStatus,
  ExpenseStatus,
  MaintenanceStatus,
  VoteStatus,
  Tables,
} from '@/types/database'

// ============================================================================
// Aggregations (admin / treasurer / committee dashboards)
// ============================================================================

const APPROVED_PAYMENT: PaymentStatus = 'approved'
const PAID_EXPENSE: ExpenseStatus = 'paid'
const PENDING_PAYMENT: PaymentStatus = 'pending'
const ACTIVE_VOTE: VoteStatus = 'active'

const OPEN_MAINTENANCE_STATUSES: MaintenanceStatus[] = [
  'new',
  'reviewing',
  'waiting_quote',
  'waiting_approval',
  'in_progress',
  'reopened',
]

async function sumPayments(
  buildingId: string,
  status: PaymentStatus,
  periodMonthFrom?: string,
  periodMonthToExclusive?: string,
): Promise<number> {
  const supabase = await createClient()
  let q = supabase
    .from('payments')
    .select('amount')
    .eq('building_id', buildingId)
    .eq('status', status)
  if (periodMonthFrom) q = q.gte('period_month', periodMonthFrom)
  if (periodMonthToExclusive) q = q.lt('period_month', periodMonthToExclusive)
  const { data, error } = await q
  if (error || !data) return 0
  return data.reduce((acc, row) => acc + Number(row.amount ?? 0), 0)
}

async function sumExpenses(
  buildingId: string,
  status: ExpenseStatus,
  expenseDateFrom?: string,
  expenseDateToExclusive?: string,
): Promise<number> {
  const supabase = await createClient()
  let q = supabase
    .from('expenses')
    .select('amount')
    .eq('building_id', buildingId)
    .eq('status', status)
  if (expenseDateFrom) q = q.gte('expense_date', expenseDateFrom)
  if (expenseDateToExclusive) q = q.lt('expense_date', expenseDateToExclusive)
  const { data, error } = await q
  if (error || !data) return 0
  return data.reduce((acc, row) => acc + Number(row.amount ?? 0), 0)
}

export type FinancialSummary = {
  balance: number
  monthIncome: number
  monthExpense: number
  pendingPaymentsCount: number
  openMaintenanceCount: number
  activeVotesCount: number
}

/** Building-wide financial + ops counters. Visible to admin/treasurer/committee. */
export async function getBuildingDashboardSummary(
  buildingId: string,
): Promise<FinancialSummary> {
  const supabase = await createClient()
  // Closed range [monthStart, nextMonthStart) so future-dated rows are excluded.
  const monthStart = periodMonthString()
  const nextMonthStart = nextMonthString()

  const [
    totalIncome,
    totalExpense,
    monthIncome,
    monthExpense,
    pendingPayments,
    openMaint,
    activeVotes,
  ] = await Promise.all([
    sumPayments(buildingId, APPROVED_PAYMENT),
    sumExpenses(buildingId, PAID_EXPENSE),
    sumPayments(buildingId, APPROVED_PAYMENT, monthStart, nextMonthStart),
    sumExpenses(buildingId, PAID_EXPENSE, monthStart, nextMonthStart),
    supabase
      .from('payments')
      .select('*', { count: 'exact', head: true })
      .eq('building_id', buildingId)
      .eq('status', PENDING_PAYMENT),
    supabase
      .from('maintenance_requests')
      .select('*', { count: 'exact', head: true })
      .eq('building_id', buildingId)
      .in('status', OPEN_MAINTENANCE_STATUSES),
    supabase
      .from('votes')
      .select('*', { count: 'exact', head: true })
      .eq('building_id', buildingId)
      .eq('status', ACTIVE_VOTE)
      .gte('ends_at', new Date().toISOString()),
  ])

  return {
    balance: totalIncome - totalExpense,
    monthIncome,
    monthExpense,
    pendingPaymentsCount: pendingPayments.count ?? 0,
    openMaintenanceCount: openMaint.count ?? 0,
    activeVotesCount: activeVotes.count ?? 0,
  }
}

// ============================================================================
// Recent activity widgets
// ============================================================================

export type RecentPayment = Pick<
  Tables<'payments'>,
  'id' | 'amount' | 'status' | 'method' | 'payment_date' | 'period_month' | 'apartment_id'
> & { apartment_number: string | null }

export async function getRecentPayments(
  buildingId: string,
  limit = 5,
): Promise<RecentPayment[]> {
  const supabase = await createClient()

  const { data: payments } = await supabase
    .from('payments')
    .select('id, amount, status, method, payment_date, period_month, apartment_id')
    .eq('building_id', buildingId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!payments || payments.length === 0) return []

  const aptIds = Array.from(new Set(payments.map((p) => p.apartment_id)))
  const { data: apts } = await supabase
    .from('apartments')
    .select('id, number')
    .in('id', aptIds)

  const aptMap = new Map((apts ?? []).map((a) => [a.id, a.number] as const))

  return payments.map((p) => ({
    ...p,
    apartment_number: aptMap.get(p.apartment_id) ?? null,
  }))
}

export type RecentExpense = Pick<
  Tables<'expenses'>,
  'id' | 'title' | 'amount' | 'status' | 'expense_date' | 'category'
>

export async function getRecentExpenses(
  buildingId: string,
  limit = 5,
): Promise<RecentExpense[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('expenses')
    .select('id, title, amount, status, expense_date, category')
    .eq('building_id', buildingId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as RecentExpense[]
}

export type RecentMaintenance = Pick<
  Tables<'maintenance_requests'>,
  'id' | 'title' | 'status' | 'priority' | 'created_at' | 'apartment_id'
> & { apartment_number: string | null }

export async function getRecentMaintenance(
  buildingId: string,
  options: {
    limit?: number
    requestedBy?: string
    assignedTo?: string
    onlyOpen?: boolean
  } = {},
): Promise<RecentMaintenance[]> {
  const supabase = await createClient()
  const { limit = 5, requestedBy, assignedTo, onlyOpen } = options

  let q = supabase
    .from('maintenance_requests')
    .select('id, title, status, priority, created_at, apartment_id')
    .eq('building_id', buildingId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (requestedBy) q = q.eq('requested_by', requestedBy)
  if (assignedTo) q = q.eq('assigned_to', assignedTo)
  if (onlyOpen) q = q.in('status', OPEN_MAINTENANCE_STATUSES)

  const { data } = await q
  if (!data || data.length === 0) return []

  const aptIds = Array.from(
    new Set(data.map((r) => r.apartment_id).filter((id): id is string => Boolean(id))),
  )
  const aptMap = new Map<string, string>()
  if (aptIds.length > 0) {
    const { data: apts } = await supabase
      .from('apartments')
      .select('id, number')
      .in('id', aptIds)
    for (const a of apts ?? []) aptMap.set(a.id, a.number)
  }

  return data.map((r) => ({
    ...r,
    apartment_number: r.apartment_id ? aptMap.get(r.apartment_id) ?? null : null,
  }))
}

// ============================================================================
// Active votes — with "voted/not voted" hint per user's apartments
// ============================================================================

export type ActiveVoteSummary = {
  id: string
  title: string
  ends_at: string
  total_apartments: number
  apartments_voted: number
  user_voting_status: 'voted' | 'pending' | 'not_eligible'
}

export async function getActiveVotesForUser(
  buildingId: string,
  userId: string,
): Promise<ActiveVoteSummary[]> {
  const supabase = await createClient()
  const now = new Date().toISOString()

  // 1) Active votes in this building.
  const { data: votes } = await supabase
    .from('votes')
    .select('id, title, ends_at, building_id')
    .eq('building_id', buildingId)
    .eq('status', ACTIVE_VOTE)
    .gte('ends_at', now)
    .order('ends_at', { ascending: true })

  if (!votes || votes.length === 0) return []

  // 2) Apartments where this user is the active voting representative.
  const { data: repApts } = await supabase
    .from('apartment_members')
    .select('apartment_id')
    .eq('user_id', userId)
    .eq('building_id', buildingId)
    .eq('is_voting_representative', true)
    .eq('is_active', true)
  const repAptIds = (repApts ?? []).map((r) => r.apartment_id)

  // 3) Total eligible apartments in the building (occupied + vacant).
  const { count: totalApts } = await supabase
    .from('apartments')
    .select('*', { count: 'exact', head: true })
    .eq('building_id', buildingId)

  const voteIds = votes.map((v) => v.id)

  // 4) Counts of apartments that voted per vote (one row per apartment due to unique).
  const { data: responses } = await supabase
    .from('vote_responses')
    .select('vote_id, apartment_id')
    .in('vote_id', voteIds)

  const votedByVote = new Map<string, Set<string>>()
  for (const r of responses ?? []) {
    let s = votedByVote.get(r.vote_id)
    if (!s) {
      s = new Set<string>()
      votedByVote.set(r.vote_id, s)
    }
    s.add(r.apartment_id)
  }

  return votes.map((v) => {
    const voted = votedByVote.get(v.id) ?? new Set()
    let status: ActiveVoteSummary['user_voting_status'] = 'not_eligible'
    if (repAptIds.length > 0) {
      // "voted" only if ALL of the user's rep-apartments have voted.
      const allDone = repAptIds.every((id) => voted.has(id))
      status = allDone ? 'voted' : 'pending'
    }
    return {
      id: v.id,
      title: v.title,
      ends_at: v.ends_at,
      total_apartments: totalApts ?? 0,
      apartments_voted: voted.size,
      user_voting_status: status,
    }
  })
}

// ============================================================================
// Resident-specific aggregates
// ============================================================================

export type ResidentSummary = {
  apartmentNumbers: string[]
  /** Estimated outstanding amount: number of unpaid months in the last 12
   *  (no `approved` payment with a matching `period_month`) × monthly_fee.
   *  See `OUTSTANDING_LOOKBACK_MONTHS` for the window. */
  outstanding: number
  outstandingMonths: number
  lastPayment: {
    amount: number
    payment_date: string
    status: PaymentStatus
  } | null
  ownOpenMaintenanceCount: number
}

/** How many months back to count for outstanding. The current month is intentionally
 *  excluded because it isn't due yet. */
const OUTSTANDING_LOOKBACK_MONTHS = 12

export async function getResidentSummary(
  buildingId: string,
  userId: string,
): Promise<ResidentSummary> {
  const supabase = await createClient()

  // Apartments the user is linked to.
  const { data: members } = await supabase
    .from('apartment_members')
    .select('apartment_id')
    .eq('user_id', userId)
    .eq('building_id', buildingId)
    .eq('is_active', true)

  const aptIds = (members ?? []).map((m) => m.apartment_id)

  let apartmentNumbers: string[] = []
  let lastPayment: ResidentSummary['lastPayment'] = null
  let outstanding = 0
  let outstandingMonths = 0

  if (aptIds.length > 0) {
    // Need monthly_fee + created_at + number to compute outstanding accurately.
    const { data: apts } = await supabase
      .from('apartments')
      .select('id, number, monthly_fee, created_at')
      .in('id', aptIds)
      .order('number', { ascending: true })
    apartmentNumbers = (apts ?? []).map((a) => a.number)

    const { data: lastPayRow } = await supabase
      .from('payments')
      .select('amount, payment_date, status')
      .in('apartment_id', aptIds)
      .order('payment_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastPayRow) {
      lastPayment = {
        amount: Number(lastPayRow.amount),
        payment_date: lastPayRow.payment_date,
        status: lastPayRow.status,
      }
    }

    // Approved payments (only these count toward dues per §1.5.1).
    const { data: approved } = await supabase
      .from('payments')
      .select('apartment_id, period_month')
      .in('apartment_id', aptIds)
      .eq('status', APPROVED_PAYMENT)

    // Build apartment → set of paid YYYY-MM keys
    const paidByApt = new Map<string, Set<string>>()
    for (const row of approved ?? []) {
      const key = String(row.period_month).slice(0, 7) // YYYY-MM
      let s = paidByApt.get(row.apartment_id)
      if (!s) {
        s = new Set<string>()
        paidByApt.set(row.apartment_id, s)
      }
      s.add(key)
    }

    const lookback = lastNMonthKeys(OUTSTANDING_LOOKBACK_MONTHS) // last N completed months

    for (const apt of apts ?? []) {
      const fee = Number(apt.monthly_fee) || 0
      const aptCreated = apt.created_at ? new Date(apt.created_at) : new Date(0)
      const paidSet = paidByApt.get(apt.id) ?? new Set<string>()

      // Only count months that fall after the apartment was registered.
      const dueMonths = lookback.filter((mk) => {
        const [yy, mm] = mk.split('-').map(Number) as [number, number]
        const monthEnd = new Date(yy, mm, 0) // last day of that month
        return monthEnd >= aptCreated && !paidSet.has(mk)
      })

      outstandingMonths += dueMonths.length
      outstanding += dueMonths.length * fee
    }
  }

  const { count: ownMaint } = await supabase
    .from('maintenance_requests')
    .select('*', { count: 'exact', head: true })
    .eq('building_id', buildingId)
    .eq('requested_by', userId)
    .in('status', OPEN_MAINTENANCE_STATUSES)

  return {
    apartmentNumbers,
    outstanding,
    outstandingMonths,
    lastPayment,
    ownOpenMaintenanceCount: ownMaint ?? 0,
  }
}

// ============================================================================
// Technician — assigned maintenance only
// ============================================================================

export async function getTechnicianAssigned(
  buildingId: string,
  userId: string,
  limit = 20,
): Promise<RecentMaintenance[]> {
  return getRecentMaintenance(buildingId, {
    assignedTo: userId,
    onlyOpen: true,
    limit,
  })
}
