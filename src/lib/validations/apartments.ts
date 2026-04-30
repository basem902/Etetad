import { z } from 'zod'

export const apartmentSchema = z.object({
  number: z
    .string()
    .min(1, 'رقم الشقة مطلوب')
    .max(20, 'رقم الشقة طويل جداً'),
  floor: z.coerce
    .number({ invalid_type_error: 'يجب أن يكون رقماً' })
    .int('يجب أن يكون رقماً صحيحاً')
    .min(-5, 'طابق غير صالح')
    .max(200, 'طابق غير صالح')
    .optional()
    .nullable(),
  monthly_fee: z.coerce
    .number({ invalid_type_error: 'يجب أن يكون رقماً' })
    .nonnegative('لا يمكن أن تكون سالبة')
    .default(0),
  status: z.enum(['occupied', 'vacant', 'under_maintenance']).default('vacant'),
  notes: z.string().max(1000, 'الملاحظات طويلة').optional().nullable(),
})

export const linkMemberSchema = z.object({
  apartment_id: z.string().uuid(),
  email: z.string().email('بريد إلكتروني غير صالح'),
  full_name: z.string().min(2, 'الاسم مطلوب').max(100).optional().or(z.literal('')),
  relation_type: z.enum(['owner', 'resident', 'representative'], {
    errorMap: () => ({ message: 'نوع العلاقة مطلوب' }),
  }),
})

export const changeVotingRepSchema = z.object({
  apartment_id: z.string().uuid(),
  new_member_id: z.string().uuid(),
})

export const deactivateMemberSchema = z.object({
  member_id: z.string().uuid(),
  replacement_member_id: z.string().uuid().optional().or(z.literal('')),
})

export type ApartmentInput = z.infer<typeof apartmentSchema>
export type LinkMemberInput = z.infer<typeof linkMemberSchema>
export type ChangeVotingRepInput = z.infer<typeof changeVotingRepSchema>
export type DeactivateMemberInput = z.infer<typeof deactivateMemberSchema>
