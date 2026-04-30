import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronRight, Edit3 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId, getUserBuildings } from '@/lib/tenant'
import { isSuperAdmin, hasRole } from '@/lib/permissions'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { PageHeader } from '@/components/shared/page-header'
import { ApartmentStatusBadge } from '@/components/apartments/apartment-status-badge'
import { ApartmentForm } from '@/components/apartments/apartment-form'
import { LinkMemberDialog } from '@/components/apartments/link-member-dialog'
import { MembersList } from '@/components/apartments/members-list'
import { getApartment, getApartmentMembers } from '@/lib/queries/apartments'
import { formatCurrency, formatDate } from '@/lib/format'

export const metadata: Metadata = {
  title: 'تفاصيل الشقة · نظام إدارة العمارة',
}

export default async function ApartmentDetailsPage({
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

  const allowed =
    (await isSuperAdmin(user.id)) || (await hasRole(buildingId, ['admin'], user.id))
  if (!allowed) redirect('/forbidden')

  const [apartment, members] = await Promise.all([
    getApartment(buildingId, id),
    getApartmentMembers(id),
  ])

  if (!apartment) notFound()

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">
        <Link href="/apartments" className="inline-flex items-center gap-1 hover:text-foreground">
          <ChevronRight className="h-4 w-4 lucide-chevron-right" />
          العودة إلى الشقق
        </Link>
      </div>

      <PageHeader
        title={`شقة ${apartment.number}`}
        description={
          apartment.floor != null ? `الطابق ${apartment.floor}` : undefined
        }
        actions={<ApartmentStatusBadge status={apartment.status} />}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              الرسوم الشهرية
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {formatCurrency(apartment.monthly_fee)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              عدد السكان
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{apartment.member_count}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              ممثل التصويت
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-base font-medium">
              {apartment.voting_rep?.full_name ?? 'لا يوجد'}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>السكان</CardTitle>
          <CardDescription>
            ممثل التصويت يصوّت باسم الشقة. يمكن تغييره من قائمة الإجراءات.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-end">
            <LinkMemberDialog apartmentId={apartment.id} />
          </div>
          <MembersList apartmentId={apartment.id} members={members} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Edit3 className="h-4 w-4" />
            تعديل بيانات الشقة
          </CardTitle>
          <CardDescription>
            آخر تعديل: {formatDate(apartment.updated_at)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ApartmentForm
            mode="edit"
            apartmentId={apartment.id}
            initial={{
              number: apartment.number,
              floor: apartment.floor,
              monthly_fee: apartment.monthly_fee,
              status: apartment.status,
              notes: apartment.notes,
            }}
          />
        </CardContent>
      </Card>

      {apartment.notes && (
        <>
          <Separator />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">ملاحظات</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground whitespace-pre-wrap">
              {apartment.notes}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
