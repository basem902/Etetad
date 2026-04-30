import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('بريد إلكتروني غير صالح'),
  password: z.string().min(1, 'كلمة المرور مطلوبة'),
})

// Building-only fields (used both by /register and /onboarding/create-building flows).
export const buildingDetailsSchema = z.object({
  buildingName: z
    .string()
    .min(2, 'اسم العمارة مطلوب')
    .max(100, 'اسم العمارة طويل جداً'),
  city: z.string().max(80, 'اسم المدينة طويل').optional().or(z.literal('')),
  address: z.string().max(200, 'العنوان طويل').optional().or(z.literal('')),
  defaultMonthlyFee: z.coerce
    .number({ invalid_type_error: 'يجب أن تكون رقماً' })
    .nonnegative('لا يمكن أن تكون سالبة')
    .default(0),
})

// Combined signup + building creation (used by /register).
export const registerBuildingSchema = buildingDetailsSchema.extend({
  fullName: z
    .string()
    .min(2, 'الاسم يجب أن يكون حرفين على الأقل')
    .max(100, 'الاسم طويل جداً'),
  email: z.string().email('بريد إلكتروني غير صالح'),
  password: z
    .string()
    .min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل')
    .max(128, 'كلمة المرور طويلة جداً'),
})

export const forgotPasswordSchema = z.object({
  email: z.string().email('بريد إلكتروني غير صالح'),
})

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل')
      .max(128, 'كلمة المرور طويلة جداً'),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: 'كلمتا المرور غير متطابقتين',
    path: ['confirm'],
  })

export type LoginInput = z.infer<typeof loginSchema>
export type BuildingDetailsInput = z.infer<typeof buildingDetailsSchema>
export type RegisterBuildingInput = z.infer<typeof registerBuildingSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
