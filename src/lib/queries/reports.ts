import { createClient } from '@/lib/supabase/server'
import type { ParsedPeriod } from '@/lib/reports'

export type FinancialSummary = {
  income: number
  expense: number
  balance: number
  income_count: number
  expense_count: number
  outstanding_apartments_count: number | null
  outstanding_apartments_total: number | null
}

export type CategoryBreakdown = {
  category: string
  total: number
  count: number
}

export type MonthlyTotal = {
  month_start: string
  income: number
  expense: number
  income_count: number
  expense_count: number
}

export type FinancialReport = {
  summary: FinancialSummary
  byCategory: CategoryBreakdown[]
  monthlyTotals: MonthlyTotal[] | null
}

/**
 * Fetches a complete financial report for the period. Calls SECURITY DEFINER
 * RPCs which enforce role checks (admin/treasurer/committee). Throws on
 * RPC error so the caller can map to a user-readable message.
 */
export async function getFinancialReport(
  buildingId: string,
  period: ParsedPeriod,
): Promise<FinancialReport | null> {
  if (period.kind === 'invalid') return null
  const supabase = await createClient()

  if (period.kind === 'monthly') {
    const periodDate = `${period.startDate}` // YYYY-MM-01
    const [{ data: summaryRows }, { data: categoryRows }] = await Promise.all([
      supabase.rpc('get_monthly_financial_summary', {
        p_building_id: buildingId,
        p_period: periodDate,
      }),
      supabase.rpc('get_expense_category_breakdown', {
        p_building_id: buildingId,
        p_period_start: period.startDate,
        // RPC uses < end, so pass first day of next month
        p_period_end: nextMonthStart(period.year, period.month),
      }),
    ])

    const s = (summaryRows ?? [])[0]
    if (!s) return null
    return {
      summary: {
        income: Number(s.income),
        expense: Number(s.expense),
        balance: Number(s.balance),
        income_count: Number(s.income_count),
        expense_count: Number(s.expense_count),
        outstanding_apartments_count: Number(s.outstanding_apartments_count),
        outstanding_apartments_total: Number(s.outstanding_apartments_total),
      },
      byCategory: (categoryRows ?? []).map((r) => ({
        category: String(r.category),
        total: Number(r.total),
        count: Number(r.count),
      })),
      monthlyTotals: null,
    }
  }

  if (period.kind === 'yearly') {
    const [{ data: monthlyRows }, { data: categoryRows }] = await Promise.all([
      supabase.rpc('get_yearly_monthly_totals', {
        p_building_id: buildingId,
        p_year: period.year,
      }),
      supabase.rpc('get_expense_category_breakdown', {
        p_building_id: buildingId,
        p_period_start: `${period.year}-01-01`,
        p_period_end: `${period.year + 1}-01-01`,
      }),
    ])

    const monthly = (monthlyRows ?? []).map((r) => ({
      month_start: String(r.month_start),
      income: Number(r.income),
      expense: Number(r.expense),
      income_count: Number(r.income_count),
      expense_count: Number(r.expense_count),
    }))
    const incomeTotal = monthly.reduce((s, m) => s + m.income, 0)
    const expenseTotal = monthly.reduce((s, m) => s + m.expense, 0)
    // Codex round 1 P2: roll up counts across months for yearly summary KPIs.
    const incomeCount = monthly.reduce((s, m) => s + m.income_count, 0)
    const expenseCount = monthly.reduce((s, m) => s + m.expense_count, 0)

    return {
      summary: {
        income: incomeTotal,
        expense: expenseTotal,
        balance: incomeTotal - expenseTotal,
        income_count: incomeCount,
        expense_count: expenseCount,
        outstanding_apartments_count: null,
        outstanding_apartments_total: null,
      },
      byCategory: (categoryRows ?? []).map((r) => ({
        category: String(r.category),
        total: Number(r.total),
        count: Number(r.count),
      })),
      monthlyTotals: monthly,
    }
  }

  // Range
  const [{ data: summaryRows }, { data: categoryRows }] = await Promise.all([
    supabase.rpc('get_range_financial_summary', {
      p_building_id: buildingId,
      p_from: period.startDate,
      p_to: period.endDate,
    }),
    supabase.rpc('get_expense_category_breakdown', {
      p_building_id: buildingId,
      p_period_start: period.startDate,
      p_period_end: nextDayIso(period.endDate),
    }),
  ])

  const s = (summaryRows ?? [])[0]
  if (!s) return null
  return {
    summary: {
      income: Number(s.income),
      expense: Number(s.expense),
      balance: Number(s.balance),
      income_count: Number(s.income_count),
      expense_count: Number(s.expense_count),
      outstanding_apartments_count: null,
      outstanding_apartments_total: null,
    },
    byCategory: (categoryRows ?? []).map((r) => ({
      category: String(r.category),
      total: Number(r.total),
      count: Number(r.count),
    })),
    monthlyTotals: null,
  }
}

function nextMonthStart(year: number, month: number): string {
  const m = month + 1
  if (m > 12) return `${year + 1}-01-01`
  return `${year}-${m < 10 ? '0' + m : m}-01`
}

function nextDayIso(yyyymmdd: string): string {
  const d = new Date(`${yyyymmdd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
