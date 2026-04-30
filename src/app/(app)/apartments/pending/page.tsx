import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId, getUserBuildings } from '@/lib/tenant'
import { isSuperAdmin, hasRole } from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared/page-header'
import { PendingMembersList } from '@/components/apartments/pending-members-list'
import type { Tables } from '@/types/database'

export const metadata: Metadata = {
  title: 'طلبات الانضمام · إدارة الشقق',
}

type PendingRow = Tables<'pending_apartment_members'>

export default async function ApartmentsPendingPage() {
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

  // Fetch pending requests for this building (RLS allows admin)
  const { data: rows } = await supabase
    .from('pending_apartment_members')
    .select(
      'id, building_id, user_id, join_link_id, requested_apartment_number, full_name, phone, status, rejection_reason, reviewed_by, reviewed_at, created_at',
    )
    .eq('building_id', buildingId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  // Fetch apartments for the approve dialog (admin needs to pick the right one)
  const { data: apartments } = await supabase
    .from('apartments')
    .select('id, number, floor')
    .eq('building_id', buildingId)
    .order('number', { ascending: true })

  const pendingRows = (rows ?? []) as PendingRow[]
  const apartmentRefs =
    apartments?.map((a) => ({ id: a.id, number: a.number, floor: a.floor })) ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="طلبات الانضمام المُعلَّقة"
        description={
          pendingRows.length > 0
            ? `لديك ${pendingRows.length} طلب${pendingRows.length === 1 ? '' : 'ات'} بانتظار المُراجعة.`
            : 'لا توجد طلبات معلَّقة حالياً.'
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/apartments">
              <ArrowRight className="h-4 w-4" />
              العودة للشقق
            </Link>
          </Button>
        }
      />

      {pendingRows.length > 0 && (
        <div className="flex items-center gap-2">
          <Badge variant="warning">
            {pendingRows.length} مُعلَّق
          </Badge>
        </div>
      )}

      <PendingMembersList rows={pendingRows} apartments={apartmentRefs} />
    </div>
  )
}
