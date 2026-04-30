import { z } from 'zod'

// =============================================
// Phase 10 validation schemas — suggestions / votes / decisions
// =============================================

// ============= Suggestions =============

export const SUGGESTION_STATUSES = [
  'new',
  'discussion',
  'pricing',
  'converted_to_vote',
  'approved',
  'rejected',
  'archived',
] as const

export const suggestionCreateSchema = z.object({
  title: z
    .string()
    .min(2, 'العنوان مطلوب (حرفان على الأقل)')
    .max(200, 'العنوان طويل (الحد 200 حرف)'),
  description: z
    .string()
    .max(2000, 'الوصف طويل')
    .optional()
    .or(z.literal('')),
})

export const suggestionUpdateSchema = z.object({
  suggestion_id: z.string().uuid(),
  ...suggestionCreateSchema.shape,
})

export const suggestionStatusSchema = z.object({
  suggestion_id: z.string().uuid(),
  status: z.enum(['discussion', 'pricing', 'rejected', 'archived', 'approved'], {
    errorMap: () => ({ message: 'حالة غير صالحة' }),
  }),
})

// ============= Votes =============

export const APPROVAL_RULES = ['simple_majority', 'two_thirds', 'custom'] as const

export const voteCreateSchema = z
  .object({
    suggestion_id: z.string().uuid('اقتراح غير صالح').optional().or(z.literal('')),
    title: z
      .string()
      .min(2, 'العنوان مطلوب (حرفان على الأقل)')
      .max(200, 'العنوان طويل'),
    description: z.string().max(2000, 'الوصف طويل').optional().or(z.literal('')),
    options: z
      .array(z.string().min(1, 'الخيار لا يمكن أن يكون فارغاً').max(200))
      .min(2, 'يلزم خياران على الأقل')
      .max(10, 'الحد الأقصى 10 خيارات'),
    ends_at: z
      .string()
      .min(1, 'تاريخ الإغلاق مطلوب'),
    approval_rule: z.enum(APPROVAL_RULES, {
      errorMap: () => ({ message: 'قاعدة قبول غير صالحة' }),
    }),
    custom_threshold: z.coerce
      .number()
      .gt(0, 'النسبة يجب أن تكون أكبر من صفر')
      .lte(1, 'النسبة لا تتجاوز 1 (100%)')
      .optional()
      .nullable(),
    estimated_cost: z.coerce
      .number()
      .nonnegative('التكلفة لا يمكن أن تكون سالبة')
      .max(10_000_000, 'التكلفة كبيرة جداً')
      .optional()
      .nullable(),
  })
  .refine(
    (v) => v.approval_rule !== 'custom' || (v.custom_threshold != null && v.custom_threshold > 0 && v.custom_threshold <= 1),
    { message: 'النسبة المخصَّصة مطلوبة عند اختيار قاعدة custom', path: ['custom_threshold'] },
  )

export const castVoteSchema = z.object({
  vote_id: z.string().uuid(),
  apartment_id: z.string().uuid('شقة غير صالحة'),
  option_id: z.string().uuid('خيار غير صالح'),
})

// ============= Decisions =============

export const DECISION_STATUSES = [
  'approved',
  'rejected',
  'implemented',
  'postponed',
] as const

export const decisionCreateSchema = z.object({
  vote_id: z.string().uuid('تصويت غير صالح').optional().or(z.literal('')),
  title: z
    .string()
    .min(2, 'العنوان مطلوب (حرفان على الأقل)')
    .max(200, 'العنوان طويل'),
  description: z.string().max(2000, 'الوصف طويل').optional().or(z.literal('')),
  status: z.enum(DECISION_STATUSES, {
    errorMap: () => ({ message: 'حالة قرار غير صالحة' }),
  }),
  decision_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'تاريخ غير صالح')
    .optional()
    .or(z.literal('')),
})

export type SuggestionCreateInput = z.infer<typeof suggestionCreateSchema>
export type VoteCreateInput = z.infer<typeof voteCreateSchema>
export type CastVoteInput = z.infer<typeof castVoteSchema>
export type DecisionCreateInput = z.infer<typeof decisionCreateSchema>
