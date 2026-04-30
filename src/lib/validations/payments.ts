import { z } from 'zod'

export const PAYMENT_METHODS = ['cash', 'bank_transfer', 'online', 'cheque'] as const
export const PAYMENT_STATUSES = ['pending', 'approved', 'rejected'] as const

export const paymentCreateSchema = z.object({
  apartment_id: z.string().uuid('يجب اختيار شقة'),
  amount: z.coerce
    .number({ invalid_type_error: 'يجب أن يكون رقماً' })
    .positive('المبلغ يجب أن يكون أكبر من صفر')
    .max(1_000_000, 'المبلغ كبير جداً'),
  payment_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'تاريخ غير صالح'),
  // <input type="month"> emits 'YYYY-MM'.
  period_month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'يجب اختيار الشهر'),
  method: z.enum(PAYMENT_METHODS, { errorMap: () => ({ message: 'طريقة دفع غير صالحة' }) }),
  notes: z.string().max(500, 'الملاحظات طويلة').optional().or(z.literal('')),
})

export const paymentUpdateSchema = paymentCreateSchema.partial().extend({
  payment_id: z.string().uuid(),
})

export const paymentRejectSchema = z.object({
  payment_id: z.string().uuid(),
  rejection_reason: z
    .string()
    .min(3, 'سبب الرفض مطلوب (3 أحرف على الأقل)')
    .max(500, 'السبب طويل'),
})

export type PaymentCreateInput = z.infer<typeof paymentCreateSchema>
export type PaymentRejectInput = z.infer<typeof paymentRejectSchema>
