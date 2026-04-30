/**
 * Arabic-localized formatters for currency, dates, and relative times.
 * Uses Saudi locale (`ar-SA`) with explicit Gregorian calendar override
 * (Hijri is the default for ar-SA but the spec calls for ميلادي).
 */

const sarFormatter = new Intl.NumberFormat('ar-SA', {
  style: 'currency',
  currency: 'SAR',
  maximumFractionDigits: 2,
})

const sarFormatterCompact = new Intl.NumberFormat('ar-SA', {
  style: 'currency',
  currency: 'SAR',
  maximumFractionDigits: 0,
})

const numberFormatter = new Intl.NumberFormat('ar-SA')

// `ar-SA-u-ca-gregory` keeps Arabic localization but forces the Gregorian calendar.
const dateShort = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

const dateLong = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

const dateTime = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

const monthYear = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
  year: 'numeric',
  month: 'long',
})

const relativeTime = new Intl.RelativeTimeFormat('ar', { numeric: 'auto' })

export function formatCurrency(
  amount: number | null | undefined,
  { compact = false }: { compact?: boolean } = {},
): string {
  if (amount == null) return '—'
  return (compact ? sarFormatterCompact : sarFormatter).format(amount)
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '—'
  return numberFormatter.format(n)
}

function asDate(input: string | Date | null | undefined): Date | null {
  if (input == null) return null
  const d = input instanceof Date ? input : new Date(input)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatDate(input: string | Date | null | undefined): string {
  const d = asDate(input)
  return d ? dateShort.format(d) : '—'
}

export function formatDateLong(input: string | Date | null | undefined): string {
  const d = asDate(input)
  return d ? dateLong.format(d) : '—'
}

export function formatDateTime(input: string | Date | null | undefined): string {
  const d = asDate(input)
  return d ? dateTime.format(d) : '—'
}

export function formatMonth(input: string | Date | null | undefined): string {
  const d = asDate(input)
  return d ? monthYear.format(d) : '—'
}

const SECOND = 1
const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const MONTH = 30 * DAY
const YEAR = 365 * DAY

export function formatRelative(input: string | Date | null | undefined): string {
  const d = asDate(input)
  if (!d) return '—'
  const diffSeconds = (d.getTime() - Date.now()) / 1000
  const abs = Math.abs(diffSeconds)
  if (abs < MINUTE) return relativeTime.format(Math.round(diffSeconds / SECOND), 'second')
  if (abs < HOUR) return relativeTime.format(Math.round(diffSeconds / MINUTE), 'minute')
  if (abs < DAY) return relativeTime.format(Math.round(diffSeconds / HOUR), 'hour')
  if (abs < WEEK) return relativeTime.format(Math.round(diffSeconds / DAY), 'day')
  if (abs < MONTH) return relativeTime.format(Math.round(diffSeconds / WEEK), 'week')
  if (abs < YEAR) return relativeTime.format(Math.round(diffSeconds / MONTH), 'month')
  return relativeTime.format(Math.round(diffSeconds / YEAR), 'year')
}

/** Returns a YYYY-MM-01 string for the given date's month (default = today). */
export function periodMonthString(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}

/** Returns the YYYY-MM-01 string for the month *after* the given date (default = today).
 *  Useful as the upper bound (`lt`) when filtering "this month only" ranges. */
export function nextMonthString(date: Date = new Date()): string {
  const next = new Date(date.getFullYear(), date.getMonth() + 1, 1)
  return periodMonthString(next)
}

/** Returns the YYYY-MM (no day) of a given date — used for matching `period_month` keys. */
export function periodKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** Returns the last N month keys (YYYY-MM) ending with the month *before* `from` (default: today).
 *  Example: `lastNMonthKeys(12)` returns the 12 months prior to the current month. */
export function lastNMonthKeys(n: number, from: Date = new Date()): string[] {
  const keys: string[] = []
  for (let i = 1; i <= n; i++) {
    keys.push(periodKey(new Date(from.getFullYear(), from.getMonth() - i, 1)))
  }
  return keys
}
