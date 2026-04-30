import { z } from 'zod'

// =============================================
// Phase 8 validation schemas — maintenance requests
// =============================================

export const MAINTENANCE_LOCATIONS = [
  'apartment',
  'entrance',
  'elevator',
  'roof',
  'parking',
  'other',
] as const

export const MAINTENANCE_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const

export const MAINTENANCE_STATUSES = [
  'new',
  'reviewing',
  'waiting_quote',
  'waiting_approval',
  'in_progress',
  'completed',
  'rejected',
  'reopened',
] as const

/** Whitelisted state transitions; mirrors trg_maint_validate_transition. */
export const MAINTENANCE_TRANSITIONS: Record<
  (typeof MAINTENANCE_STATUSES)[number],
  (typeof MAINTENANCE_STATUSES)[number][]
> = {
  new: ['reviewing', 'rejected'],
  reviewing: ['waiting_quote', 'waiting_approval', 'rejected'],
  waiting_quote: ['waiting_approval', 'rejected'],
  waiting_approval: ['in_progress', 'rejected'],
  in_progress: ['completed', 'reopened'],
  completed: ['reopened'],
  reopened: ['in_progress', 'reviewing'],
  rejected: [], // terminal
}

export const maintenanceCreateSchema = z.object({
  title: z
    .string()
    .min(2, 'العنوان مطلوب (حرفان على الأقل)')
    .max(200, 'العنوان طويل (الحد 200 حرف)'),
  description: z.string().max(2000, 'الوصف طويل').optional().or(z.literal('')),
  location_type: z.enum(MAINTENANCE_LOCATIONS, {
    errorMap: () => ({ message: 'نوع موقع غير صالح' }),
  }),
  priority: z.enum(MAINTENANCE_PRIORITIES, {
    errorMap: () => ({ message: 'أولوية غير صالحة' }),
  }),
  apartment_id: z.string().uuid('شقة غير صالحة').optional().or(z.literal('')),
})

export const maintenanceAssignSchema = z.object({
  request_id: z.string().uuid(),
  technician_id: z.string().uuid('فني غير صالح'),
  cost: z.coerce
    .number({ invalid_type_error: 'التكلفة يجب أن تكون رقماً' })
    .nonnegative('التكلفة لا يمكن أن تكون سالبة')
    .max(10_000_000, 'التكلفة كبيرة جداً')
    .optional(),
})

export const maintenanceQuoteSchema = z.object({
  request_id: z.string().uuid(),
  cost: z.coerce
    .number({ invalid_type_error: 'التكلفة يجب أن تكون رقماً' })
    .nonnegative('التكلفة لا يمكن أن تكون سالبة')
    .max(10_000_000, 'التكلفة كبيرة جداً'),
})

export const maintenanceCompleteSchema = z.object({
  request_id: z.string().uuid(),
})

export type MaintenanceCreateInput = z.infer<typeof maintenanceCreateSchema>
export type MaintenanceAssignInput = z.infer<typeof maintenanceAssignSchema>
export type MaintenanceQuoteInput = z.infer<typeof maintenanceQuoteSchema>
