import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export const RECEIPTS_BUCKET = 'receipts'
export const INVOICES_BUCKET = 'invoices'
export const MAINTENANCE_BUCKET = 'maintenance'
export const DOCUMENTS_BUCKET = 'documents'

export const ALLOWED_RECEIPT_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const

export const MAX_RECEIPT_SIZE = 5 * 1024 * 1024 // 5 MB

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

/**
 * Validate a file the user uploaded as a payment receipt.
 * Server actions and the client-side picker share this for consistent rules.
 */
export function validateReceiptFile(file: File): Result<true> {
  if (!file || file.size === 0) {
    return { ok: false, error: 'الإيصال مطلوب' }
  }
  if (file.size > MAX_RECEIPT_SIZE) {
    return { ok: false, error: 'الحجم يجب أن يكون أقل من 5 ميجا' }
  }
  if (!(ALLOWED_RECEIPT_MIMES as readonly string[]).includes(file.type)) {
    return {
      ok: false,
      error: 'الأنواع المسموحة: صور (JPG/PNG/WebP) أو PDF',
    }
  }
  return { ok: true, data: true }
}

function safeExt(name: string, mime: string): string {
  const fromName = name.includes('.') ? (name.split('.').pop() ?? '').toLowerCase() : ''
  if (['jpg', 'jpeg', 'png', 'webp', 'pdf'].includes(fromName)) return fromName
  if (mime === 'application/pdf') return 'pdf'
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'bin'
}

/**
 * Uploads a receipt to `receipts/{buildingId}/payments/{paymentId}/receipt.<ext>`.
 * Returns the storage path (used as `payments.receipt_url`).
 *
 * Storage RLS (Phase 1) requires the caller to be an active member of the
 * building; the supabase client passed in MUST be the user-scoped one (not
 * service role).
 */
export async function uploadReceipt(
  supabase: SupabaseClient<Database>,
  args: { buildingId: string; paymentId: string; file: File },
): Promise<Result<{ path: string }>> {
  const v = validateReceiptFile(args.file)
  if (!v.ok) return v

  const ext = safeExt(args.file.name, args.file.type)
  const path = `${args.buildingId}/payments/${args.paymentId}/receipt.${ext}`

  const { error } = await supabase.storage.from(RECEIPTS_BUCKET).upload(path, args.file, {
    contentType: args.file.type,
    upsert: false,
  })
  if (error) {
    return { ok: false, error: 'فشل رفع الإيصال إلى التخزين' }
  }
  return { ok: true, data: { path } }
}

/** Generate a short-lived signed URL for displaying/downloading a receipt. */
export async function getReceiptSignedUrl(
  supabase: SupabaseClient<Database>,
  path: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const { data } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds)
  return data?.signedUrl ?? null
}

/** Best-effort cleanup if a payment row insert fails after upload. */
export async function deleteReceipt(
  supabase: SupabaseClient<Database>,
  path: string,
): Promise<void> {
  try {
    await supabase.storage.from(RECEIPTS_BUCKET).remove([path])
  } catch {
    /* best-effort */
  }
}

export function isImagePath(path: string): boolean {
  const ext = (path.split('.').pop() ?? '').toLowerCase()
  return ['jpg', 'jpeg', 'png', 'webp'].includes(ext)
}

// =============================================
// Phase 7 — Invoices (expenses)
// =============================================

export const ALLOWED_INVOICE_MIMES = ALLOWED_RECEIPT_MIMES // same set
export const MAX_INVOICE_SIZE = 10 * 1024 * 1024 // 10 MB (matches bucket config)

/** Same shape as receipt but with the invoice size cap. */
export function validateInvoiceFile(file: File): Result<true> {
  if (!file || file.size === 0) {
    return { ok: false, error: 'الفاتورة مطلوبة' }
  }
  if (file.size > MAX_INVOICE_SIZE) {
    return { ok: false, error: 'الحجم يجب أن يكون أقل من 10 ميجا' }
  }
  if (!(ALLOWED_INVOICE_MIMES as readonly string[]).includes(file.type)) {
    return {
      ok: false,
      error: 'الأنواع المسموحة: صور (JPG/PNG/WebP) أو PDF',
    }
  }
  return { ok: true, data: true }
}

/**
 * Uploads an invoice to `invoices/{buildingId}/expenses/{expenseId}/invoice-<ts>.<ext>`.
 * Path includes a timestamp so re-uploading on a subsequent edit doesn't collide
 * with a prior file (we keep history; orphan policy can clean unlinked ones).
 */
export async function uploadInvoice(
  supabase: SupabaseClient<Database>,
  args: { buildingId: string; expenseId: string; file: File },
): Promise<Result<{ path: string }>> {
  const v = validateInvoiceFile(args.file)
  if (!v.ok) return v

  const ext = safeExt(args.file.name, args.file.type)
  const stamp = Date.now()
  const path = `${args.buildingId}/expenses/${args.expenseId}/invoice-${stamp}.${ext}`

  const { error } = await supabase.storage.from(INVOICES_BUCKET).upload(path, args.file, {
    contentType: args.file.type,
    upsert: false,
  })
  if (error) {
    return { ok: false, error: 'فشل رفع الفاتورة إلى التخزين' }
  }
  return { ok: true, data: { path } }
}

/** Signed URL for the invoice (treasurer/admin/committee per RLS). */
export async function getInvoiceSignedUrl(
  supabase: SupabaseClient<Database>,
  path: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const { data } = await supabase.storage
    .from(INVOICES_BUCKET)
    .createSignedUrl(path, expiresInSeconds)
  return data?.signedUrl ?? null
}

/** Best-effort cleanup if expense insert/update fails after upload. */
export async function deleteInvoice(
  supabase: SupabaseClient<Database>,
  path: string,
): Promise<void> {
  try {
    await supabase.storage.from(INVOICES_BUCKET).remove([path])
  } catch {
    /* best-effort */
  }
}

// =============================================
// Phase 7 — Receipts attached to expenses (proof of payment)
// =============================================
// Same `receipts` bucket used by payments, but the path namespace is different:
// `{buildingId}/expenses/{expenseId}/receipt.<ext>`. The RLS orphan policy in
// 10_phase7.sql checks BOTH payments.receipt_url and expenses.receipt_url so
// rollback works for either source.

/**
 * Uploads a payment-proof receipt for an expense at:
 * `receipts/{buildingId}/expenses/{expenseId}/receipt.<ext>`.
 */
export async function uploadExpenseReceipt(
  supabase: SupabaseClient<Database>,
  args: { buildingId: string; expenseId: string; file: File },
): Promise<Result<{ path: string }>> {
  const v = validateReceiptFile(args.file)
  if (!v.ok) return v

  const ext = safeExt(args.file.name, args.file.type)
  const stamp = Date.now()
  const path = `${args.buildingId}/expenses/${args.expenseId}/receipt-${stamp}.${ext}`

  const { error } = await supabase.storage.from(RECEIPTS_BUCKET).upload(path, args.file, {
    contentType: args.file.type,
    upsert: false,
  })
  if (error) {
    return { ok: false, error: 'فشل رفع الإيصال إلى التخزين' }
  }
  return { ok: true, data: { path } }
}

// =============================================
// Phase 8 — Maintenance images (before/after)
// =============================================
// Photos only — no PDF — since these document a physical site/repair.
export const ALLOWED_MAINTENANCE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

export const MAX_MAINTENANCE_IMAGE_SIZE = 10 * 1024 * 1024 // 10 MB

export function validateMaintenanceImage(file: File): Result<true> {
  if (!file || file.size === 0) {
    return { ok: false, error: 'الصورة مطلوبة' }
  }
  if (file.size > MAX_MAINTENANCE_IMAGE_SIZE) {
    return { ok: false, error: 'الحجم يجب أن يكون أقل من 10 ميجا' }
  }
  if (!(ALLOWED_MAINTENANCE_MIMES as readonly string[]).includes(file.type)) {
    return { ok: false, error: 'الأنواع المسموحة: JPG, PNG, WebP فقط' }
  }
  return { ok: true, data: true }
}

/** Upload to `maintenance/{buildingId}/maintenance/{requestId}/{kind}-<ts>.<ext>`. */
export async function uploadMaintenanceImage(
  supabase: SupabaseClient<Database>,
  args: {
    buildingId: string
    requestId: string
    kind: 'before' | 'after'
    file: File
  },
): Promise<Result<{ path: string }>> {
  const v = validateMaintenanceImage(args.file)
  if (!v.ok) return v

  const ext = safeExt(args.file.name, args.file.type)
  const stamp = Date.now()
  const path = `${args.buildingId}/maintenance/${args.requestId}/${args.kind}-${stamp}.${ext}`

  const { error } = await supabase.storage
    .from(MAINTENANCE_BUCKET)
    .upload(path, args.file, {
      contentType: args.file.type,
      upsert: false,
    })
  if (error) {
    return { ok: false, error: 'فشل رفع الصورة إلى التخزين' }
  }
  return { ok: true, data: { path } }
}

export async function getMaintenanceImageSignedUrl(
  supabase: SupabaseClient<Database>,
  path: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const { data } = await supabase.storage
    .from(MAINTENANCE_BUCKET)
    .createSignedUrl(path, expiresInSeconds)
  return data?.signedUrl ?? null
}

export async function deleteMaintenanceImage(
  supabase: SupabaseClient<Database>,
  path: string,
): Promise<void> {
  try {
    await supabase.storage.from(MAINTENANCE_BUCKET).remove([path])
  } catch {
    /* best-effort */
  }
}

// =============================================
// Phase 11 — Documents (PDF + Office + images)
// =============================================
export const ALLOWED_DOCUMENT_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const

export const MAX_DOCUMENT_SIZE = 25 * 1024 * 1024 // 25 MB (matches bucket config)

export function validateDocumentFile(file: File): Result<true> {
  if (!file || file.size === 0) {
    return { ok: false, error: 'الملف مطلوب' }
  }
  if (file.size > MAX_DOCUMENT_SIZE) {
    return { ok: false, error: 'الحجم يجب أن يكون أقل من 25 ميجا' }
  }
  if (!(ALLOWED_DOCUMENT_MIMES as readonly string[]).includes(file.type)) {
    return {
      ok: false,
      error: 'الأنواع المسموحة: PDF, Word, Excel, JPG, PNG',
    }
  }
  return { ok: true, data: true }
}

/** Upload to `documents/{buildingId}/documents/{docId}/{safe-filename}.<ext>`. */
export async function uploadDocument(
  supabase: SupabaseClient<Database>,
  args: { buildingId: string; documentId: string; file: File },
): Promise<Result<{ path: string }>> {
  const v = validateDocumentFile(args.file)
  if (!v.ok) return v

  const ext = safeExt(args.file.name, args.file.type)
  const stamp = Date.now()
  const path = `${args.buildingId}/documents/${args.documentId}/file-${stamp}.${ext}`

  const { error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, args.file, {
      contentType: args.file.type,
      upsert: false,
    })
  if (error) {
    return { ok: false, error: 'فشل رفع الملف إلى التخزين' }
  }
  return { ok: true, data: { path } }
}

export async function getDocumentSignedUrl(
  supabase: SupabaseClient<Database>,
  path: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const { data } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds)
  return data?.signedUrl ?? null
}

export async function deleteDocumentFile(
  supabase: SupabaseClient<Database>,
  path: string,
): Promise<void> {
  try {
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([path])
  } catch {
    /* best-effort */
  }
}
