import { z } from 'zod'

// =============================================
// Phase 11 validation schemas — documents
// =============================================

export const documentCreateSchema = z.object({
  title: z
    .string()
    .min(2, 'العنوان مطلوب (حرفان على الأقل)')
    .max(200, 'العنوان طويل (الحد 200 حرف)'),
  category: z
    .string()
    .max(80, 'التصنيف طويل')
    .optional()
    .or(z.literal('')),
  is_public: z.coerce.boolean().optional(),
})

export const documentUpdateSchema = z.object({
  document_id: z.string().uuid(),
  title: z.string().min(2).max(200),
  category: z.string().max(80).optional().or(z.literal('')),
  is_public: z.coerce.boolean().optional(),
})

export type DocumentCreateInput = z.infer<typeof documentCreateSchema>
