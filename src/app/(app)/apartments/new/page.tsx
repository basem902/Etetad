import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId, getUserBuildings } from '@/lib/tenant'
import { isSuperAdmin, hasRole } from '@/lib/permissions'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/shared/page-header'
import { ApartmentForm } from '@/components/apartments/apartment-form'

export const metadata: Metadata = {
  title: 'إضافة شقة · نظام إدارة العمارة',
}

export default async function NewApartmentPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const buildings = await getUserBuildings(user.id)
  if (buildings.length === 0) redirect('/onboarding')

  const buildingId = (await getActiveBuildingId()) ?? buildings[0]?.building_id
  if (!buildingId) redirect('/onboarding')

  const allowed =
    (await isSuperAdmin(user.id)) || (await hasRole(buildingId, ['admin'], user.id))
  if (!allowed) redirect('/forbidden')

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="إضافة شقة"
        description="رقم الشقة يجب أن يكون فريداً ضمن العمارة."
      />
      <Card>
        <CardContent className="pt-6">
          <ApartmentForm mode="create" />
        </CardContent>
      </Card>
    </div>
  )
}
