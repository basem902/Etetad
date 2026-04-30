import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId, getUserBuildings } from '@/lib/tenant'
import { hasRole, isSuperAdmin } from '@/lib/permissions'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/shared/page-header'
import { VendorForm } from '@/components/vendors/vendor-form'
import { listVendorSpecialties } from '@/lib/queries/vendors'

export const metadata: Metadata = {
  title: 'مورد جديد · نظام إدارة العمارة',
}

export default async function NewVendorPage() {
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
    (await hasRole(buildingId, ['admin', 'treasurer', 'committee'], user.id))
  if (!canManage) redirect('/vendors')

  const specialties = await listVendorSpecialties(buildingId)

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="مورد جديد"
        description="أضف مزوّد خدمة جديد لقاعدة بيانات العمارة."
      />
      <Card>
        <CardContent className="pt-6">
          <VendorForm specialtySuggestions={specialties} />
        </CardContent>
      </Card>
    </div>
  )
}
