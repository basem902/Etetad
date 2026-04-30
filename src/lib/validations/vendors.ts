import { z } from 'zod'

// =============================================
// Phase 9 validation schemas — vendors
// =============================================

const ratingSchema = z.coerce
  .number({ invalid_type_error: 'التقييم يجب أن يكون رقماً' })
  .min(0, 'التقييم لا يمكن أن يكون سالباً')
  .max(5, 'التقييم لا يتجاوز 5')
  .optional()
  .nullable()

const baseFields = {
  name: z
    .string()
    .min(2, 'الاسم مطلوب (حرفان على الأقل)')
    .max(200, 'الاسم طويل (الحد 200 حرف)'),
  phone: z
    .string()
    .max(30, 'رقم الجوال طويل')
    .optional()
    .or(z.literal('')),
  specialty: z
    .string()
    .max(100, 'التخصص طويل')
    .optional()
    .or(z.literal('')),
  rating: z
    .union([z.literal(''), ratingSchema])
    .optional(),
  notes: z
    .string()
    .max(2000, 'الملاحظات طويلة')
    .optional()
    .or(z.literal('')),
}

export const vendorCreateSchema = z.object(baseFields)

export const vendorUpdateSchema = z.object({
  vendor_id: z.string().uuid(),
  ...baseFields,
})

export const vendorToggleActiveSchema = z.object({
  vendor_id: z.string().uuid(),
  is_active: z.coerce.boolean(),
})

export type VendorCreateInput = z.infer<typeof vendorCreateSchema>
export type VendorUpdateInput = z.infer<typeof vendorUpdateSchema>
