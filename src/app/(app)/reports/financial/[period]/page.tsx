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
import { FinancialReportView } from '@/components/reports/financial-report'
import { PrintButton } from '@/components/reports/print-button'
import { parsePeriod } from '@/lib/reports'
import { getFinancialReport } from '@/lib/queries/reports'
import '@/components/reports/print-styles.css'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ period: string }>
}): Promise<Metadata> {
  const { period } = await params
  const decoded = decodeURIComponent(period)
  const parsed = parsePeriod(decoded)
  const label = parsed.kind === 'invalid' ? 'فترة غير صالحة' : parsed.label
  return { title: `${label} · التقرير المالي · نظام إدارة العمارة` }
}

export default async function FinancialReportPage({
  params,
}: {
  params: Promise<{ period: string }>
}) {
  const { period: rawPeriod } = await params
  const period = parsePeriod(decodeURIComponent(rawPeriod))

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

  if (period.kind === 'invalid') {
    return (
      <div className="space-y-4">
        <PageHeader title="فترة غير صالحة" description="تنسيق الفترة في الرابط غير معروف." />
        <p className="text-sm">
          صيغ مدعومة: <code>YYYY-MM</code> (شهري) · <code>YYYY</code> (سنوي) ·{' '}
          <code>YYYY-MM-DD~YYYY-MM-DD</code> (نطاق).
        </p>
        <Link href="/reports/financial" className="text-primary hover:underline">
          العودة لاختيار الفترة
        </Link>
      </div>
    )
  }

  const report = await getFinancialReport(buildingId, period)

  return (
    <div className="space-y-6">
      <div data-print-hide className="text-sm text-muted-foreground">
        <Link
          href="/reports/financial"
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4 lucide-chevron-right" />
          العودة لاختيار فترة
        </Link>
      </div>

      <PageHeader
        title={`التقرير المالي · ${period.label}`}
        description="الأرقام مُحتسبة من قاعدة البيانات: دخل = مدفوعات معتمدة، مصروف = مصروفات مدفوعة."
        actions={<PrintButton />}
      />

      <div data-print-hide>
        <Card>
          <CardContent className="pt-6">
            <PeriodSelector currentPeriod={rawPeriod} />
          </CardContent>
        </Card>
      </div>

      <div data-print-area>
        {report ? (
          <FinancialReportView report={report} periodLabel={period.label} />
        ) : (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              لا توجد بيانات لهذه الفترة.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
