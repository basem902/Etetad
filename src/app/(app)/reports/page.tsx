import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BarChart3, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId, getUserBuildings } from '@/lib/tenant'
import { hasRole, isSuperAdmin } from '@/lib/permissions'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { PageHeader } from '@/components/shared/page-header'

export const metadata: Metadata = {
  title: 'التقارير · نظام إدارة العمارة',
}

export default async function ReportsHomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const buildings = await getUserBuildings(user.id)
  if (buildings.length === 0) redirect('/onboarding')

  const buildingId = (await getActiveBuildingId()) ?? buildings[0]?.building_id
  if (!buildingId) redirect('/onboarding')

  const isAuthorized =
    (await isSuperAdmin(user.id)) ||
    (await hasRole(buildingId, ['admin', 'treasurer', 'committee'], user.id))
  if (!isAuthorized) redirect('/forbidden')

  return (
    <div className="space-y-6">
      <PageHeader
        title="التقارير"
        description="تقارير مالية شاملة قابلة للطباعة. الحسابات تُجرى في قاعدة البيانات لضمان الدقة والسرعة."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/reports/financial">
          <Card className="hover:bg-muted/30 transition-colors h-full">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                التقرير المالي
              </CardTitle>
              <CardDescription>
                دخل، مصروفات، رصيد، متأخرات، توزيع التصنيفات. شهرياً أو سنوياً أو نطاق مخصَّص.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              يَدعم الطباعة بـ RTL نظيف
            </CardContent>
          </Card>
        </Link>

        <Card className="opacity-50 cursor-not-allowed">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              المزيد قريباً
            </CardTitle>
            <CardDescription>
              تقارير أداء الصيانة، تقارير الموردين، تقارير الحضور للجمعية العمومية.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  )
}
