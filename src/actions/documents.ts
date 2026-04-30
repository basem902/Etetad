'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId } from '@/lib/tenant'
import { hasRole, isSuperAdmin } from '@/lib/permissions'
import {
  documentCreateSchema,
  documentUpdateSchema,
} from '@/lib/validations/documents'
import {
  uploadDocument,
  deleteDocumentFile,
  getDocumentSignedUrl,
  validateDocumentFile,
} from '@/lib/storage'

type ActionResult<T = void> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

function fdGet(form: FormData, key: string): string | undefined {
  const v = form.get(key)
  return typeof v === 'string' ? v : undefined
}

async function ensureManager(
  buildingId: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'يجب تسجيل الدخول' }
  const allowed =
    (await isSuperAdmin(user.id)) ||
    (await hasRole(buildingId, ['admin', 'treasurer', 'committee'], user.id))
  if (!allowed) {
    return { ok: false, error: 'إدارة المستندات لمدير/أمين/لجنة العمارة فقط' }
  }
  return { ok: true, userId: user.id }
}

// =============================================
// Upload document
// =============================================
export async function uploadDocumentAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensureManager(buildingId)
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = documentCreateSchema.safeParse({
    title: fdGet(formData, 'title'),
    category: fdGet(formData, 'category') ?? '',
    is_public: fdGet(formData, 'is_public') === 'true' || fdGet(formData, 'is_public') === 'on',
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة' }
  }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: 'الملف مطلوب' }
  }
  const v = validateDocumentFile(file)
  if (!v.ok) return { success: false, error: v.error }

  const supabase = await createClient()
  const documentId = crypto.randomUUID()

  // Upload first
  const up = await uploadDocument(supabase, {
    buildingId,
    documentId,
    file,
  })
  if (!up.ok) return { success: false, error: up.error }

  // Insert row
  const { error: insErr } = await supabase.from('documents').insert({
    id: documentId,
    building_id: buildingId,
    title: parsed.data.title.trim(),
    category: parsed.data.category?.trim() || null,
    file_url: up.data.path,
    file_size: file.size,
    uploaded_by: auth.userId,
    is_public: parsed.data.is_public ?? true,
  })

  if (insErr) {
    // Best-effort cleanup (orphan storage policy will eventually allow it)
    await deleteDocumentFile(supabase, up.data.path)
    return { success: false, error: 'تعذّر تسجيل المستند' }
  }

  revalidatePath('/documents')
  return { success: true, data: { id: documentId }, message: 'تم رفع المستند' }
}

// =============================================
// Update document metadata (title, category, is_public)
// =============================================
export async function updateDocumentAction(
  formData: FormData,
): Promise<ActionResult> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensureManager(buildingId)
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = documentUpdateSchema.safeParse({
    document_id: fdGet(formData, 'document_id'),
    title: fdGet(formData, 'title'),
    category: fdGet(formData, 'category') ?? '',
    is_public: fdGet(formData, 'is_public') === 'true' || fdGet(formData, 'is_public') === 'on',
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة' }
  }

  const supabase = await createClient()
  const { data: updated, error } = await supabase
    .from('documents')
    .update({
      title: parsed.data.title.trim(),
      category: parsed.data.category?.trim() || null,
      is_public: parsed.data.is_public ?? true,
    })
    .eq('id', parsed.data.document_id)
    .eq('building_id', buildingId)
    .select('id')
    .maybeSingle()

  if (error) return { success: false, error: 'تعذّر تحديث المستند' }
  if (!updated) {
    return { success: false, error: 'المستند غير موجود في هذه العمارة' }
  }

  revalidatePath('/documents')
  return { success: true, message: 'تم حفظ التعديلات' }
}

// =============================================
// Delete document (admin/treasurer/committee)
// =============================================
export async function deleteDocumentAction(
  documentId: string,
): Promise<ActionResult> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensureManager(buildingId)
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()
  // Read file_url first so we can clean up storage
  const { data: doc } = await supabase
    .from('documents')
    .select('id, file_url')
    .eq('id', documentId)
    .eq('building_id', buildingId)
    .maybeSingle()

  if (!doc) return { success: false, error: 'المستند غير موجود' }

  const { error: delErr } = await supabase
    .from('documents')
    .delete()
    .eq('id', documentId)
    .eq('building_id', buildingId)

  if (delErr) return { success: false, error: 'تعذّر حذف المستند' }

  // After row delete, the file becomes orphan and the cleanup policy permits removal.
  await deleteDocumentFile(supabase, doc.file_url)

  revalidatePath('/documents')
  return { success: true, message: 'تم حذف المستند' }
}

// =============================================
// Generate signed download URL for a document
// =============================================
export async function getDocumentDownloadUrlAction(
  documentId: string,
): Promise<ActionResult<{ url: string }>> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const supabase = await createClient()
  const { data: doc } = await supabase
    .from('documents')
    .select('file_url, is_public')
    .eq('id', documentId)
    .eq('building_id', buildingId)
    .maybeSingle()

  if (!doc) return { success: false, error: 'المستند غير موجود' }

  // Storage RLS will further enforce who can read; this just generates the URL.
  const url = await getDocumentSignedUrl(supabase, doc.file_url, 3600)
  if (!url) {
    return { success: false, error: 'تعذّر إنشاء رابط التحميل' }
  }
  return { success: true, data: { url } }
}
