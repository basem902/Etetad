import { z } from 'zod'

// =============================================
// Phase 7 validation schemas — expenses workflow
// =============================================

export const EXPENSE_STATUSES = [
  'draft',
  'pending_review',
  'approved',
  'rejected',
  'paid',
  'cancelled',
] as const

/** Whitelisted state transitions; mirrors trg_expenses_validate_transition. */
export const EXPENSE_TRANSITIONS: Record<
  (typeof EXPENSE_STATUSES)[number],
  (typeof EXPENSE_STATUSES)[number][]
> = {
  draft: ['pending_review', 'cancelled'],
  pending_review: ['approved', 'rejected', 'cancelled'],
  rejected: ['draft', 'cancelled'],
  approved: ['paid', 'cancelled'],
  paid: [], // terminal
  cancelled: [], // terminal
}

const baseFields = {
  title: z
    .string()
    .min(2, 'العنوان مطلوب (حرفان على الأقل)')
    .max(200, 'العنوان طويل (الحد 200 حرف)'),
  description: z.string().max(2000, 'الوصف طويل').optional().or(z.literal('')),
  category: z.string().max(80, 'التصنيف طويل').optional().or(z.literal('')),
  amount: z.coerce
    .number({ invalid_type_error: 'المبلغ يجب أن يكون رقماً' })
    .positive('المبلغ يجب أن يكون أكبر من صفر')
    .max(10_000_000, 'المبلغ كبير جداً'),
  expense_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'تاريخ غير صالح'),
  vendor_id: z.string().uuid('مورد غير صالح').optional().or(z.literal('')),
}

export const expenseCreateSchema = z.object(baseFields)

export const expenseUpdateSchema = z.object({
  expense_id: z.string().uuid(),
  ...baseFields,
})

export const expenseRejectSchema = z.object({
  expense_id: z.string().uuid(),
  reason: z
    .string()
    .min(3, 'سبب الرفض مطلوب (3 أحرف على الأقل)')
    .max(500, 'السبب طويل'),
})

export const expenseCancelSchema = z.object({
  expense_id: z.string().uuid(),
  cancellation_reason: z
    .string()
    .min(3, 'سبب الإلغاء مطلوب (3 أحرف على الأقل)')
    .max(500, 'السبب طويل'),
})

export type ExpenseCreateInput = z.infer<typeof expenseCreateSchema>
export type ExpenseUpdateInput = z.infer<typeof expenseUpdateSchema>
export type ExpenseRejectInput = z.infer<typeof expenseRejectSchema>
export type ExpenseCancelInput = z.infer<typeof expenseCancelSchema>
