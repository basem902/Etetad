import { Home, Receipt, Wrench, AlertCircle } from 'lucide-react'
import { StatsCard } from './stats-card'
import { RecentMaintenance } from './recent-maintenance'
import { ActiveVotes } from './active-votes'
import { QuickActions } from './quick-actions'
import { PaymentStatusBadge } from './status-badges'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
import { formatCurrency, formatDate } from '@/lib/format'
import { getResidentSummary } from '@/lib/queries/dashboard'

export async function ResidentDashboard({
  buildingId,
  userId,
}: {
  buildingId: string
  userId: string
}) {
  const s = await getResidentSummary(buildingId, userId)
  const apartmentsLabel =
    s.apartmentNumbers.length === 0
      ? 'غير مرتبط بشقة'
      : s.apartmentNumbers.length === 1
        ? `شقة ${s.apartmentNumbers[0]}`
        : `${s.apartmentNumbers.length} شقق`

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          label="المستحقات (المتأخر)"
          value={formatCurrency(s.outstanding)}
          icon={AlertCircle}
          description={
            s.outstandingMonths > 0
              ? `${s.outstandingMonths} شهر غير مدفوع (آخر ١٢ شهر)`
              : 'لا متأخرات'
          }
          emphasizeNegative={false}
          trend={
            s.outstandingMonths > 0
              ? { label: 'يحتاج سداد', variant: 'warning' }
              : { label: 'محدَّث', variant: 'success' }
          }
        />
        <StatsCard
          label="شقتي"
          value={apartmentsLabel}
          icon={Home}
          description={
            s.apartmentNumbers.length > 1
              ? s.apartmentNumbers.map((n) => `شقة ${n}`).join('، ')
              : undefined
          }
        />
        <StatsCard
          label="آخر دفعة"
          value={s.lastPayment ? formatCurrency(s.lastPayment.amount) : '—'}
          icon={Receipt}
          description={
            s.lastPayment ? formatDate(s.lastPayment.payment_date) : 'لا توجد دفعات'
          }
          trend={
            s.lastPayment
              ? {
                  label:
                    s.lastPayment.status === 'approved'
                      ? 'معتمدة'
                      : s.lastPayment.status === 'pending'
                        ? 'بانتظار'
                        : 'مرفوضة',
                  variant:
                    s.lastPayment.status === 'approved'
                      ? 'success'
                      : s.lastPayment.status === 'pending'
                        ? 'warning'
                        : 'destructive',
                }
              : undefined
          }
        />
        <StatsCard
          label="طلبات صيانتي"
          value={s.ownOpenMaintenanceCount}
          icon={Wrench}
          description="مفتوحة"
        />
      </div>

      <QuickActions role="resident" />

      <div className="grid gap-4 lg:grid-cols-2">
        <RecentMaintenance
          buildingId={buildingId}
          requestedBy={userId}
          title="طلبات الصيانة الخاصة بي"
        />
        <ActiveVotes buildingId={buildingId} userId={userId} />
      </div>

      {/* Apartment-linked payments preview (own only via RLS) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">آخر مدفوعاتي</CardTitle>
        </CardHeader>
        <CardContent>
          {s.lastPayment ? (
            <div className="flex items-center justify-between text-sm">
              <div className="flex flex-col">
                <span className="text-muted-foreground text-xs">
                  {formatDate(s.lastPayment.payment_date)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <PaymentStatusBadge status={s.lastPayment.status} />
                <span className="font-semibold tabular-nums">
                  {formatCurrency(s.lastPayment.amount)}
                </span>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={Receipt}
              title="لا توجد مدفوعات"
              description="ابدأ بتسجيل دفعتك الأولى من زر 'تسجيل دفعة'."
              className="py-8"
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
