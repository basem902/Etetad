import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId, getUserBuildings } from '@/lib/tenant'
import { hasRole, isSuperAdmin } from '@/lib/permissions'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/shared/page-header'
import { PaymentForm } from '@/components/payments/payment-form'
import { listApartmentsForPayment } from '@/lib/queries/payments'

export const metadata: Metadata = {
  title: 'تسجيل دفعة · نظام إدارة العمارة',
}

export default async function NewPaymentPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const buildings = await getUserBuildings(user.id)
  if (buildings.length === 0) redirect('/onboarding')

  const buildingId = (await getActiveBuildingId()) ?? buildings[0]?.building_id
  if (!buildingId) redirect('/onboarding')

  // Privileged users can pick any apartment; residents only see their own.
  const isPrivileged =
    (await isSuperAdmin(user.id)) ||
    (await hasRole(buildingId, ['admin', 'treasurer'], user.id))

  const apartments = await listApartmentsForPayment(buildingId, user.id, isPrivileged)

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="تسجيل دفعة"
        description="ارفع إيصال التحويل وسيقوم أمين الصندوق بمراجعته."
      />
      <Card>
        <CardContent className="pt-6">
          <PaymentForm apartments={apartments} />
        </CardContent>
      </Card>
    </div>
  )
}
