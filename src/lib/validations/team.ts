import { z } from 'zod'

// Phase 19: /team — non-apartment-bound roles only.
// admin role goes through super-admin path. resident role through apartments
// LinkMember + join requests (Phase 17). This validation explicitly excludes both.
export const TEAM_ROLES = ['treasurer', 'committee', 'technician'] as const
export type TeamRole = (typeof TEAM_ROLES)[number]

export const addTeamMemberSchema = z.object({
  email: z
    .string()
    .min(5, 'البريد الإلكتروني قصير')
    .max(254, 'البريد الإلكتروني طويل')
    .email('بريد إلكتروني غير صالح'),
  full_name: z
    .string()
    .min(2, 'الاسم مطلوب')
    .max(100, 'الاسم طويل')
    .optional()
    .or(z.literal('')),
  role: z.enum(TEAM_ROLES, {
    errorMap: () => ({ message: 'الدور مطلوب: أمين صندوق / لجنة / فني' }),
  }),
})

export const deactivateTeamMemberSchema = z.object({
  membership_id: z.string().uuid(),
})

export type AddTeamMemberInput = z.infer<typeof addTeamMemberSchema>
export type DeactivateTeamMemberInput = z.infer<typeof deactivateTeamMemberSchema>

// Arabic labels for UI rendering
export const ROLE_LABELS_AR: Record<TeamRole, string> = {
  treasurer: 'أمين صندوق',
  committee: 'عضو لجنة',
  technician: 'فني',
}
