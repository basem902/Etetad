import Link from 'next/link'
import { ArrowLeft, Receipt } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
import { PaymentStatusBadge } from '@/components/dashboard/status-badges'
import { formatCurrency, formatDate } from '@/lib/format'
import { getRecentPayments } from '@/lib/queries/dashboard'

export async function RecentPayments({ buildingId }: { buildingId: string }) {
  const items = await getRecentPayments(buildingId, 5)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">آخر المدفوعات</CardTitle>
        <Link
          href="/payments"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
        >
          عرض الكل
          <ArrowLeft className="h-3 w-3 lucide-arrow-left" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="لا توجد مدفوعات بعد"
            description="ستظهر هنا أحدث 5 مدفوعات."
            className="py-8"
          />
        ) : (
          <ul className="space-y-3">
            {items.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 text-sm border-b border-border pb-3 last:border-b-0 last:pb-0"
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="font-medium truncate">
                    شقة {p.apartment_number ?? '—'}
                    <span className="text-muted-foreground font-normal mr-2">
                      · {formatDate(p.payment_date)}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    شهر: {p.period_month ? formatDate(p.period_month) : '—'}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <PaymentStatusBadge status={p.status} />
                  <span className="font-semibold tabular-nums">
                    {formatCurrency(Number(p.amount))}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
