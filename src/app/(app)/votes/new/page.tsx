import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId, getUserBuildings } from '@/lib/tenant'
import { hasRole, isSuperAdmin } from '@/lib/permissions'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/shared/page-header'
import { VoteForm } from '@/components/votes/vote-form'

export const metadata: Metadata = {
  title: 'تصويت جديد · نظام إدارة العمارة',
}

export default async function NewVotePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const buildings = await getUserBuildings(user.id)
  if (buildings.length === 0) redirect('/onboarding')

  const buildingId = (await getActiveBuildingId()) ?? buildings[0]?.building_id
  if (!buildingId) redirect('/onboarding')

  const canManage =
    (await isSuperAdmin(user.id)) ||
    (await hasRole(buildingId, ['admin', 'committee'], user.id))
  if (!canManage) redirect('/votes')

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="تصويت جديد"
        description="ينشَأ كمسودّة. تَقدر تَفعّله بعد المراجعة. التصويت per-apartment صارم."
      />
      <Card>
        <CardContent className="pt-6">
          <VoteForm />
        </CardContent>
      </Card>
    </div>
  )
}
