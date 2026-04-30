import type { MembershipRole } from '@/types/database'
import { AdminDashboard } from './admin-dashboard'
import { ResidentDashboard } from './resident-dashboard'
import { TechnicianDashboard } from './technician-dashboard'

interface Props {
  buildingId: string
  userId: string
  role: MembershipRole
}

/**
 * Picks the dashboard variant based on the user's role in the active building.
 * Each variant is a *separate* Server Component (per PLAN: "dashboard مختلف
 * فعلياً بين الأدوار، لا صفحة واحدة بإخفاء أزرار").
 */
export function RoleBasedDashboard({ buildingId, userId, role }: Props) {
  if (role === 'technician') {
    return <TechnicianDashboard buildingId={buildingId} userId={userId} />
  }
  if (role === 'resident') {
    return <ResidentDashboard buildingId={buildingId} userId={userId} />
  }
  // admin / treasurer / committee share the financial+ops view, but their
  // QuickActions differ (handled inside AdminDashboard via role prop).
  return <AdminDashboard buildingId={buildingId} userId={userId} role={role} />
}
