'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId } from '@/lib/tenant'
import { hasRole, isSuperAdmin } from '@/lib/permissions'
import {
  taskCreateSchema,
  taskUpdateStatusSchema,
} from '@/lib/validations/tasks'

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
    (await hasRole(buildingId, ['admin', 'committee'], user.id))
  if (!allowed) {
    return { ok: false, error: 'إنشاء/تعديل المهام لمدير العمارة أو اللجنة فقط' }
  }
  return { ok: true, userId: user.id }
}

// =============================================
// Create — admin/committee creates a task
// =============================================
export async function createTaskAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const auth = await ensureManager(buildingId)
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = taskCreateSchema.safeParse({
    title: fdGet(formData, 'title'),
    description: fdGet(formData, 'description') ?? '',
    priority: fdGet(formData, 'priority'),
    due_date: fdGet(formData, 'due_date') ?? '',
    assigned_to: fdGet(formData, 'assigned_to') ?? '',
  })
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة',
    }
  }

  const supabase = await createClient()
  const taskId = crypto.randomUUID()

  const { error } = await supabase.from('tasks').insert({
    id: taskId,
    building_id: buildingId,
    title: parsed.data.title.trim(),
    description: parsed.data.description?.trim() || null,
    priority: parsed.data.priority,
    due_date: parsed.data.due_date || null,
    assigned_to: parsed.data.assigned_to || null,
    status: 'todo',
    created_by: auth.userId,
  })

  if (error) {
    return { success: false, error: 'تعذّر إنشاء المهمة' }
  }

  revalidatePath('/tasks')
  return { success: true, data: { id: taskId }, message: 'تم إنشاء المهمة' }
}

// =============================================
// Update status — admin/committee or assignee
// =============================================
// Tasks workflow أبسط: 4 حالات (todo, in_progress, waiting_external, completed).
// أي حالة → أي حالة مسموح (المرونة مقصودة لـ task tracker شخصي).
export async function updateTaskStatusAction(
  formData: FormData,
): Promise<ActionResult> {
  const buildingId = await getActiveBuildingId()
  if (!buildingId) return { success: false, error: 'لم يتم تحديد عمارة نشطة' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'يجب تسجيل الدخول' }

  const parsed = taskUpdateStatusSchema.safeParse({
    task_id: fdGet(formData, 'task_id'),
    status: fdGet(formData, 'status'),
  })
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة',
    }
  }

  // RLS UPDATE policy already restricts to admin/committee or assignee.
  const { data: updated, error } = await supabase
    .from('tasks')
    .update({ status: parsed.data.status })
    .eq('id', parsed.data.task_id)
    .eq('building_id', buildingId)
    .select('id')
    .maybeSingle()

  if (error) return { success: false, error: 'تعذّر تحديث المهمة' }
  if (!updated) {
    return {
      success: false,
      error: 'لم نعثر على المهمة (ربما حُذفت أو لا تملك صلاحية)',
    }
  }

  revalidatePath('/tasks')
  return { success: true, message: 'تم تحديث الحالة' }
}
