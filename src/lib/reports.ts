// =============================================
// src/lib/reports.ts — Report period helpers (PURE FUNCTIONS)
// =============================================
// Period URL formats supported:
//   - YYYY-MM       (monthly, e.g. "2026-04")
//   - YYYY          (yearly, e.g. "2026")
//   - YYYY-MM-DD~YYYY-MM-DD (custom range)
// =============================================

export type ParsedPeriod =
  | { kind: 'monthly'; year: number; month: number; label: string; startDate: string; endDate: string }
  | { kind: 'yearly'; year: number; label: string; startDate: string; endDate: string }
  | { kind: 'range'; from: string; to: string; label: string; startDate: string; endDate: string }
  | { kind: 'invalid'; raw: string }

const ARABIC_MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
]

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

function lastDayOfMonth(year: number, month: number): number {
  // month is 1..12
  return new Date(year, month, 0).getDate()
}

/** Parse a period string from the URL. Returns null for invalid input. */
export function parsePeriod(raw: string): ParsedPeriod {
  if (!raw) return { kind: 'invalid', raw }

  // Custom range: YYYY-MM-DD~YYYY-MM-DD
  if (raw.includes('~')) {
    const [from, to] = raw.split('~')
    if (
      from && to &&
      /^\d{4}-\d{2}-\d{2}$/.test(from) &&
      /^\d{4}-\d{2}-\d{2}$/.test(to) &&
      from <= to
    ) {
      return {
        kind: 'range',
        from,
        to,
        label: `${from} → ${to}`,
        startDate: from,
        endDate: to,
      }
    }
    return { kind: 'invalid', raw }
  }

  // Monthly: YYYY-MM
  const monthly = raw.match(/^(\d{4})-(\d{2})$/)
  if (monthly) {
    const year = Number(monthly[1])
    const month = Number(monthly[2])
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) {
      const startDate = `${year}-${pad2(month)}-01`
      const endDate = `${year}-${pad2(month)}-${pad2(lastDayOfMonth(year, month))}`
      return {
        kind: 'monthly',
        year,
        month,
        label: `${ARABIC_MONTHS[month - 1]} ${year}`,
        startDate,
        endDate,
      }
    }
  }

  // Yearly: YYYY
  const yearly = raw.match(/^(\d{4})$/)
  if (yearly) {
    const year = Number(yearly[1])
    if (year >= 2000 && year <= 2100) {
      return {
        kind: 'yearly',
        year,
        label: `سنة ${year}`,
        startDate: `${year}-01-01`,
        endDate: `${year}-12-31`,
      }
    }
  }

  return { kind: 'invalid', raw }
}

/** Default period for the report landing page. */
export function defaultPeriod(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

/** Returns the period N months before the given period. */
export function shiftPeriod(period: ParsedPeriod, deltaMonths: number): string | null {
  if (period.kind === 'monthly') {
    let m = period.month + deltaMonths
    let y = period.year
    while (m < 1) { m += 12; y -= 1 }
    while (m > 12) { m -= 12; y += 1 }
    return `${y}-${pad2(m)}`
  }
  if (period.kind === 'yearly') {
    return `${period.year + Math.sign(deltaMonths)}`
  }
  return null
}

export const ARABIC_MONTH_NAMES = ARABIC_MONTHS
