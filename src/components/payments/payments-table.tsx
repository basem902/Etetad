import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/empty-state'
import { PaymentStatusBadge } from '@/components/dashboard/status-badges'
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
  total: number
  page: number
  pageSize: number
  baseHref?: string
  searchParams?: Record<string, string | undefined>
}

function buildHref(
  basePath: string,
  searchParams: Record<string, string | undefined>,
  overrides: Record<string, string | number>,
): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams)) {
    if (v) sp.set(k, v)
  }
  for (const [k, v] of Object.entries(overrides)) {
    sp.set(k, String(v))
  }
  const qs = sp.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

export function PaymentsTable({
  rows,
  total,
  page,
  pageSize,
  baseHref = '/payments',
  searchParams = {},
}: Props) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="لا توجد مدفوعات"
        description="جرّب تغيير الفلاتر، أو سجّل دفعة جديدة."
      />
    )
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const fromCount = (page - 1) * pageSize + 1
  const toCount = Math.min(page * pageSize, total)

  return (
    <div className="space-y-3">
      <Card className="overflow-hidden">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="h-10 px-3 text-right font-medium">تاريخ الدفع</th>
                <th className="h-10 px-3 text-right font-medium">الشقة</th>
                <th className="h-10 px-3 text-right font-medium">عن شهر</th>
                <th className="h-10 px-3 text-right font-medium">المبلغ</th>
                <th className="h-10 px-3 text-right font-medium">الطريقة</th>
                <th className="h-10 px-3 text-right font-medium">الحالة</th>
                <th className="h-10 px-3 text-right font-medium">
                  <span className="sr-only">إجراءات</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr
                  key={p.id}
                  className="border-t border-border hover:bg-muted/30 transition-colors"
                >
                  <td className="h-12 px-3 align-middle whitespace-nowrap">
                    {formatDate(p.payment_date)}
                  </td>
                  <td className="h-12 px-3 align-middle">
                    شقة {p.apartment_number ?? '—'}
                  </td>
                  <td className="h-12 px-3 align-middle whitespace-nowrap">
                    {formatMonth(p.period_month)}
                  </td>
                  <td className="h-12 px-3 align-middle font-semibold tabular-nums">
                    {formatCurrency(Number(p.amount))}
                  </td>
                  <td className="h-12 px-3 align-middle text-xs text-muted-foreground">
                    {METHOD_LABELS[p.method]}
                  </td>
                  <td className="h-12 px-3 align-middle">
                    <PaymentStatusBadge status={p.status} />
                  </td>
                  <td className="h-12 px-3 align-middle">
                    <Link
                      href={`/payments/${p.id}`}
                      className="inline-flex items-center gap-1 text-xs text-foreground hover:underline"
                    >
                      التفاصيل
                      <ChevronLeft className="h-3.5 w-3.5 lucide-chevron-left" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            عرض {fromCount}–{toCount} من {total}
          </span>
          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              disabled={page <= 1}
              aria-disabled={page <= 1}
            >
              <Link href={buildHref(baseHref, searchParams, { page: page - 1 })}>
                <ChevronRight className="h-4 w-4 lucide-chevron-right" />
                السابق
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              aria-disabled={page >= totalPages}
            >
              <Link href={buildHref(baseHref, searchParams, { page: page + 1 })}>
                التالي
                <ChevronLeft className="h-4 w-4 lucide-chevron-left" />
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
