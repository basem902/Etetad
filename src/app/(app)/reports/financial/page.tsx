import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId, getUserBuildings } from '@/lib/tenant'
import { hasRole, isSuperAdmin } from '@/lib/permissions'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/shared/page-header'
import { PeriodSelector } from '@/components/reports/period-selector'
import { defaultPeriod } from '@/lib/reports'

export const metadata: Metadata = {
  title: 'التقرير المالي · نظام إدارة العمارة',
}

export default async function FinancialReportLandingPage() {
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

  // Default: redirect to current month report
  const today = defaultPeriod()

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">
        <Link
          href="/reports"
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4 lucide-chevron-right" />
          العودة إلى التقارير
        </Link>
      </div>

      <PageHeader
        title="التقرير المالي"
        description="اختر الفترة لعرض تفاصيل الدخل والمصروفات والرصيد."
      />

      <Card>
        <CardContent className="pt-6">
          <PeriodSelector currentPeriod={today} />
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground">
        أو افتح تقرير الشهر الحالي مباشرة:{' '}
        <Link
          href={`/reports/financial/${today}`}
          className="text-primary hover:underline"
        >
          {today}
        </Link>
      </div>
    </div>
  )
}
