import Link from 'next/link'
import { Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/empty-state'
import { ApprovalActions } from './approval-actions'
import { formatCurrency, formatDate, formatMonth } from '@/lib/format'
import type { PaymentRow } from '@/lib/queries/payments'

const METHOD_LABELS = {
  cash: 'نقد',
  bank_transfer: 'تحويل بنكي',
  online: 'تحويل أونلاين',
  cheque: 'شيك',
} as const

interface Props {
  rows: PaymentRow[]
}

/**
 * "بانتظار المراجعة" — separate section, treasurer/admin only.
 * Per §1.5.1 we keep pending payments visually separate from the approved
 * balance so users (and reviewers) don't conflate "submitted" with "counted".
 */
export function PendingPayments({ rows }: Props) {
  return (
    <Card className="border-warning/40 bg-warning/5">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-warning" />
            بانتظار المراجعة
            {rows.length > 0 && (
              <Badge variant="warning" className="ms-1">
                {rows.length}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            هذه الدفعات لا تُحسب في الرصيد حتى يتم اعتمادها.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            title="لا توجد دفعات بانتظار المراجعة"
            description="ستظهر هنا أي دفعة جديدة يسجلها ساكن."
            className="py-6 bg-transparent border-warning/20"
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((p) => (
              <li
                key={p.id}
                className="flex flex-col gap-2 rounded-md border border-warning/30 bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <Link
                    href={`/payments/${p.id}`}
                    className="font-medium hover:underline truncate"
                  >
                    شقة {p.apartment_number ?? '—'} ·{' '}
                    <span className="font-semibold tabular-nums">
                      {formatCurrency(Number(p.amount))}
                    </span>
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {METHOD_LABELS[p.method]} · {formatDate(p.payment_date)} · شهر{' '}
                    {formatMonth(p.period_month)}
                  </span>
                  {p.user_name && (
                    <span className="text-xs text-muted-foreground">
                      المُسجِّل: {p.user_name}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/payments/${p.id}`}>التفاصيل</Link>
                  </Button>
                  <ApprovalActions paymentId={p.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
