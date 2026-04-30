import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId, getUserBuildings } from '@/lib/tenant'
import { hasRole, isSuperAdmin } from '@/lib/permissions'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/shared/page-header'
import { VendorForm } from '@/components/vendors/vendor-form'
import {
  getVendor,
  listVendorSpecialties,
} from '@/lib/queries/vendors'

export const metadata: Metadata = {
  title: 'تعديل المورد · نظام إدارة العمارة',
}

export default async function EditVendorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

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
  if (!canManage) redirect(`/vendors/${id}`)

  const vendor = await getVendor(buildingId, id)
  if (!vendor) notFound()

  const specialties = await listVendorSpecialties(buildingId)

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title={`تعديل: ${vendor.name}`}
        description="عدّل بيانات المورد والتقييم والملاحظات."
      />
      <Card>
        <CardContent className="pt-6">
          <VendorForm
            specialtySuggestions={specialties}
            initial={{
              id: vendor.id,
              name: vendor.name,
              phone: vendor.phone,
              specialty: vendor.specialty,
              rating: vendor.rating == null ? null : Number(vendor.rating),
              notes: vendor.notes,
            }}
            editing
          />
        </CardContent>
      </Card>
    </div>
  )
}
