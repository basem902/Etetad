import { z } from 'zod'

// =============================================
// Phase 8 validation schemas — tasks
// =============================================
// Tasks workflow أبسط: 4 حالات (todo, in_progress, waiting_external, completed)
// مع 'overdue' محسوبة من due_date في الـ queries (لا تُخزَّن).

export const TASK_STATUSES = [
  'todo',
  'in_progress',
  'waiting_external',
  'completed',
] as const

export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const

export const taskCreateSchema = z.object({
  title: z
    .string()
    .min(2, 'العنوان مطلوب (حرفان على الأقل)')
    .max(200, 'العنوان طويل (الحد 200 حرف)'),
  description: z.string().max(2000, 'الوصف طويل').optional().or(z.literal('')),
  priority: z.enum(TASK_PRIORITIES, {
    errorMap: () => ({ message: 'أولوية غير صالحة' }),
  }),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'تاريخ غير صالح')
    .optional()
    .or(z.literal('')),
  assigned_to: z.string().uuid('شخص غير صالح').optional().or(z.literal('')),
})

export const taskUpdateStatusSchema = z.object({
  task_id: z.string().uuid(),
  status: z.enum(TASK_STATUSES, {
    errorMap: () => ({ message: 'حالة غير صالحة' }),
  }),
})

export type TaskCreateInput = z.infer<typeof taskCreateSchema>
export type TaskUpdateStatusInput = z.infer<typeof taskUpdateStatusSchema>
