'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveBuildingId } from '@/lib/tenant'
import { hasRole, isSuperAdmin } from '@/lib/permissions'
import { detectFormat, parseCsv, MAX_ROWS_PER_IMPORT } from '@/lib/bulk-import/parse'

type ImportResult =
  | {
      success: true
      jobId: string
      rowsTotal: number
      rowsSucceeded: number
      rowsFailed: number
      errors: { row: number; error: string }[]
    }
  | { success: false; error: string }

type ActionResult = { success: true; message?: string } | { success: false; error: string }

async function ensureAdmin(buildingId: string): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'يجب تسجيل الدخول' }

  const allowed =
    (await isSuperAdmin(user.id)) || (await hasRole(buildingId, ['admin'], user.id))
  if (!allowed) return { ok: false, error: 'هذه العملية لمدير العمارة فقط' }

  return { ok: true, userId: user.id }
}

function safeFilename(name: string): string {
  // Keep alphanumerics, dots, dashes, underscores. Drop everything else.
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'file'
}

type ImportType = 'apartments' | 'members'

// =============================================
// importApartmentsAction / importMembersAction
// =============================================
// Pattern (lessons #19, #28, #31, #37):
//   1. Validate caller is admin of the building (defense in depth)
//   2. File: client supplies File via FormData. Detect format. Parse to rows.
//   3. Upload to bulk_import_uploads bucket (server-only via admin client).
//   4. RPC create_bulk_import_job → get job_id (status=pending).
//   5. RPC process_*_bulk_import(job_id, rows) → atomic INSERT, returns errors.
//      - Validation phase first (no DB writes if any row fails)
//      - Commit phase atomic (rollback on any error)
//   6. Result returned to UI for display.
// =============================================

async function processBulkImport(
  type: ImportType,
  formData: FormData,
): Promise<ImportResult> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensureAdmin(buildingId)
  if (!auth.ok) return { success: false, error: auth.error }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return { success: false, error: 'الملف مَطلوب' }
  }
  if (file.size === 0) {
    return { success: false, error: 'الملف فارغ' }
  }
  if (file.size > 10 * 1024 * 1024) {
    return { success: false, error: 'حجم الملف يَتجاوز 10MB' }
  }

  const format = detectFormat(file.type, file.name)
  if (format === 'unknown') {
    return {
      success: false,
      error: 'صيغة الملف غير مَدعومة — استخدم CSV (UTF-8). من Excel: ملف ← حفظ باسم ← CSV',
    }
  }

  // Parse server-side (CSV only for v0.19 — see lib/bulk-import/parse.ts)
  const parsed = parseCsv(await file.text())
  if (!parsed.success) {
    return { success: false, error: parsed.error }
  }
  if (parsed.rows.length === 0) {
    return { success: false, error: 'لا توجد صفوف' }
  }
  if (parsed.rows.length > MAX_ROWS_PER_IMPORT) {
    return {
      success: false,
      error: `عدد الصفوف يَتجاوز الحد (${MAX_ROWS_PER_IMPORT})`,
    }
  }

  // Upload file to bucket (server-only, via admin client)
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return { success: false, error: 'الخدمة غير مُكوَّنة بشكل صحيح' }
  }

  const filePath = `${buildingId}/${Date.now()}_${safeFilename(file.name)}`
  const { error: uploadErr } = await admin.storage
    .from('bulk_import_uploads')
    .upload(filePath, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
  if (uploadErr) {
    return { success: false, error: 'تَعذَّر رفع الملف' }
  }

  // Create job (RPC under user session for audit)
  const supabase = await createClient()
  const { data: jobId, error: createErr } = await supabase.rpc(
    'create_bulk_import_job',
    {
      p_building_id: buildingId,
      p_type: type,
      p_file_url: filePath,
      p_file_name: file.name,
    },
  )
  if (createErr || !jobId) {
    // Best effort: cleanup the uploaded file (orphan window minimization)
    await admin.storage.from('bulk_import_uploads').remove([filePath])
    return { success: false, error: 'تَعذَّر إنشاء مَهمة الاستيراد' }
  }

  // Process atomic — RPC reads job, validates rows, commits or rolls back
  const rpcName =
    type === 'apartments'
      ? 'process_apartments_bulk_import'
      : 'process_members_bulk_import'
  const { data: result, error: processErr } = await supabase.rpc(rpcName, {
    p_job_id: jobId as string,
    p_rows: parsed.rows,
  })

  if (processErr) {
    return {
      success: false,
      error:
        'تَعذَّر تَنفيذ الاستيراد: ' +
        (processErr.message?.slice(0, 200) ?? 'unknown'),
    }
  }
  if (!result || result.length === 0) {
    return { success: false, error: 'لم يَرجع نتيجة من معالج الاستيراد' }
  }

  const summary = result[0]
  if (!summary) {
    return { success: false, error: 'لم يَرجع نتيجة من معالج الاستيراد' }
  }

  revalidatePath('/apartments')
  revalidatePath('/team')

  return {
    success: true,
    jobId: jobId as string,
    rowsTotal: parsed.rows.length,
    rowsSucceeded: Number(summary.rows_succeeded ?? 0),
    rowsFailed: Number(summary.rows_failed ?? 0),
    errors: Array.isArray(summary.errors) ? (summary.errors as { row: number; error: string }[]) : [],
  }
}

export async function importApartmentsAction(formData: FormData): Promise<ImportResult> {
  return processBulkImport('apartments', formData)
}

export async function importMembersAction(formData: FormData): Promise<ImportResult> {
  return processBulkImport('members', formData)
}

// =============================================
// cancelBulkImportJobAction — admin/super_admin
// =============================================
const cancelSchema = z.object({ job_id: z.string().uuid() })

export async function cancelBulkImportJobAction(
  formData: FormData,
): Promise<ActionResult> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensureAdmin(buildingId)
  if (!auth.ok) return { success: false, error: auth.error }

  const v = formData.get('job_id')
  const parsed = cancelSchema.safeParse({ job_id: typeof v === 'string' ? v : '' })
  if (!parsed.success) return { success: false, error: 'job_id غير صالح' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('cancel_bulk_import_job', {
    p_job_id: parsed.data.job_id,
  })
  if (error) {
    if (error.message?.toLowerCase().includes('only pending')) {
      return { success: false, error: 'لا يُمكن إلغاء المَهمة في حالتها الحالية' }
    }
    return { success: false, error: 'تَعذَّر إلغاء المَهمة' }
  }

  revalidatePath('/apartments')
  revalidatePath('/team')
  return { success: true, message: 'تم إلغاء المَهمة' }
}
