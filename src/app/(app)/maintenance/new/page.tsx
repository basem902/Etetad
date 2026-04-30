import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId, getUserBuildings } from '@/lib/tenant'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/shared/page-header'
import { RequestForm } from '@/components/maintenance/request-form'
import { listApartmentsForMaintenance } from '@/lib/queries/maintenance'

export const metadata: Metadata = {
  title: 'طلب صيانة جديد · نظام إدارة العمارة',
}

export default async function NewMaintenancePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const buildings = await getUserBuildings(user.id)
  if (buildings.length === 0) redirect('/onboarding')

  const buildingId = (await getActiveBuildingId()) ?? buildings[0]?.building_id
  if (!buildingId) redirect('/onboarding')

  const apartments = await listApartmentsForMaintenance(buildingId)

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="طلب صيانة جديد"
        description="صف المشكلة بدقة، وارفع صورة إن أمكن. سيراجعها مدير العمارة أو اللجنة."
      />
      <Card>
        <CardContent className="pt-6">
          <RequestForm apartments={apartments} />
        </CardContent>
      </Card>
    </div>
  )
}
