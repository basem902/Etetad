import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId, getUserBuildings } from '@/lib/tenant'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared/page-header'
import { RoleBasedDashboard } from '@/components/dashboard/role-based-dashboard'
import { OnboardingWizard } from '@/components/dashboard/onboarding-wizard'

export const metadata: Metadata = {
  title: 'لوحة التحكم · نظام إدارة العمارة',
}

const ROLE_LABEL = {
  admin: 'مدير',
  treasurer: 'أمين الصندوق',
  committee: 'عضو لجنة',
  resident: 'ساكن',
  technician: 'فني',
} as const

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const buildings = await getUserBuildings(user.id)
  if (buildings.length === 0) redirect('/onboarding')

  const activeBuildingId = (await getActiveBuildingId()) ?? buildings[0]?.building_id
  const active = buildings.find((b) => b.building_id === activeBuildingId) ?? buildings[0]
  if (!active || !activeBuildingId) redirect('/onboarding')

  const buildingName = active.buildings?.name ?? null
  const role = active.role

  // Phase 18 onboarding wizard — only for admins of buildings with no apartments yet.
  // Computes step completion from the actual building state.
  let wizardData: {
    apartmentsCount: number
    hasMembers: boolean
    hasJoinLink: boolean
    hasNonAdminMembership: boolean
  } | null = null

  if (role === 'admin') {
    const [aptRes, memberRes, joinLinkRes, nonAdminRes] = await Promise.all([
      supabase
        .from('apartments')
        .select('*', { count: 'exact', head: true })
        .eq('building_id', activeBuildingId),
      supabase
        .from('apartment_members')
        .select('*', { count: 'exact', head: true })
        .eq('building_id', activeBuildingId)
        .eq('is_active', true),
      supabase
        .from('building_join_links')
        .select('*', { count: 'exact', head: true })
        .eq('building_id', activeBuildingId)
        .is('disabled_at', null),
      supabase
        .from('building_memberships')
        .select('*', { count: 'exact', head: true })
        .eq('building_id', activeBuildingId)
        .eq('is_active', true)
        .neq('role', 'admin'),
    ])
    wizardData = {
      apartmentsCount: aptRes.count ?? 0,
      hasMembers: (memberRes.count ?? 0) > 0,
      hasJoinLink: (joinLinkRes.count ?? 0) > 0,
      hasNonAdminMembership: (nonAdminRes.count ?? 0) > 0,
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="لوحة التحكم"
        description={buildingName ? `العمارة النشطة: ${buildingName}` : undefined}
        actions={<Badge variant="secondary">دورك: {ROLE_LABEL[role]}</Badge>}
      />

      {wizardData && <OnboardingWizard {...wizardData} />}

      <RoleBasedDashboard
        buildingId={activeBuildingId}
        userId={user.id}
        role={role}
      />
    </div>
  )
}
