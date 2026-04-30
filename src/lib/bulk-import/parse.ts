/**
 * Phase 19: CSV parser for bulk import.
 *
 * Output shape: Array<Record<string, string>>. Header row required. Cells
 * normalized to trimmed strings.
 *
 * NOTE: server-side only. Don't import from client components — parses
 * untrusted user input.
 *
 * v0.19 design note: we deliberately do NOT include the `xlsx` npm package.
 * The published package is unmaintained and carries known prototype-pollution
 * + DoS CVEs (GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9). The SheetJS team
 * publishes patched versions only on their CDN, which bypasses pnpm's
 * integrity verification. To preserve our 0-vuln posture (lesson #27), we
 * support CSV only. Users who only have Excel can use "File → Save As → CSV
 * (UTF-8)" — the UI calls this out explicitly. Future: revisit once a
 * maintained pure-JS Excel parser exists on npm.
 */
import Papa from 'papaparse'

/** Hard cap on rows per import — DB RPC also enforces 1000 max. */
export const MAX_ROWS_PER_IMPORT = 1000

export type ParseResult =
  | { success: true; rows: Record<string, string>[] }
  | { success: false; error: string }

/**
 * CSV-injection defense: cells that start with =, +, -, @, or tab/CR are
 * potentially formulas if the user re-exports the data to Excel. We reject
 * such cells so they can't be silently accepted into the DB. Strict but
 * simple — better than allowing malicious payloads through.
 */
function isPotentialFormula(value: string): boolean {
  if (!value) return false
  const first = value.charAt(0)
  return first === '=' || first === '+' || first === '-' || first === '@' || first === '\t' || first === '\r'
}

function sanitizeRow(row: Record<string, unknown>): Record<string, string> | null {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(row)) {
    const key = String(k).trim()
    if (!key) continue
    const stringVal = v === null || v === undefined ? '' : String(v).trim()
    if (isPotentialFormula(stringVal)) {
      // Reject the entire row — caller will report the row index
      return null
    }
    out[key.toLowerCase()] = stringVal
  }
  return out
}

export function parseCsv(text: string): ParseResult {
  if (!text || text.length === 0) {
    return { success: false, error: 'الملف فارغ' }
  }
  if (text.length > 5 * 1024 * 1024) {
    return { success: false, error: 'حجم الملف كبير جداً' }
  }
  const result = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  })
  if (result.errors && result.errors.length > 0) {
    return {
      success: false,
      error: 'تَعذَّر تَحليل الملف: ' + result.errors[0]?.message,
    }
  }
  const rawRows = (result.data ?? []) as Record<string, unknown>[]
  if (rawRows.length === 0) {
    return { success: false, error: 'لا توجد صفوف بعد العنوان' }
  }
  if (rawRows.length > MAX_ROWS_PER_IMPORT) {
    return {
      success: false,
      error: `عدد الصفوف يَتجاوز الحد الأقصى (${MAX_ROWS_PER_IMPORT})`,
    }
  }
  const rows: Record<string, string>[] = []
  for (let i = 0; i < rawRows.length; i++) {
    const sanitized = sanitizeRow(rawRows[i] ?? {})
    if (!sanitized) {
      return {
        success: false,
        error: `الصف ${i + 2} يَحوي نص يَبدأ بـ = أو + أو - أو @ (CSV injection — مَرفوض)`,
      }
    }
    rows.push(sanitized)
  }
  return { success: true, rows }
}

/** Detect format by mime type or filename extension. CSV-only for v0.19. */
export function detectFormat(
  mime: string | undefined,
  filename: string,
): 'csv' | 'unknown' {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.csv') || mime === 'text/csv' || mime === 'application/csv') {
    return 'csv'
  }
  return 'unknown'
}
