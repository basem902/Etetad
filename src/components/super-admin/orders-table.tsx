import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
import { OrderStatusBadge } from '@/components/subscriptions/order-status-badge'
import { formatCurrency, formatRelative, formatDateTime } from '@/lib/format'
import type { Tables } from '@/types/database'

type OrderRow = Tables<'subscription_orders'>

interface Props {
  rows: OrderRow[]
}

export function OrdersTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="لا توجد طلبات اشتراك"
        description="عند تَسجيل عميل جديد عبر /subscribe، سيَظهر طلبه هنا."
      />
    )
  }

  return (
    <>
      {/* Mobile: card stack */}
      <div className="md:hidden space-y-3">
        {rows.map((row) => (
          <Link
            key={row.id}
            href={`/super-admin/orders/${row.id}`}
            className="block"
          >
            <Card className="hover:bg-muted/30 transition-colors">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-xs text-muted-foreground">
                      {row.reference_number}
                    </div>
                    <div className="font-semibold truncate">{row.full_name}</div>
                  </div>
                  <OrderStatusBadge status={row.status} />
                </div>
                <div className="text-sm truncate">{row.building_name}</div>
                <div className="flex items-center justify-between">
                  <span className="text-base font-semibold tabular-nums">
                    {formatCurrency(Number(row.total_amount))}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {row.tier_id} · {row.cycle === 'monthly' ? 'شهري' : 'سنوي'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border">
                  <span title={formatDateTime(row.created_at)}>
                    {formatRelative(row.created_at)}
                  </span>
                  <span className="inline-flex items-center gap-1 text-foreground">
                    التفاصيل
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Desktop: table */}
      <Card className="overflow-hidden hidden md:block">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="h-10 px-3 text-right font-medium align-middle">
                المرجع
              </th>
              <th className="h-10 px-3 text-right font-medium align-middle">العميل</th>
              <th className="h-10 px-3 text-right font-medium align-middle">العمارة</th>
              <th className="h-10 px-3 text-right font-medium align-middle">الباقة</th>
              <th className="h-10 px-3 text-right font-medium align-middle">المبلغ</th>
              <th className="h-10 px-3 text-right font-medium align-middle">الحالة</th>
              <th className="h-10 px-3 text-right font-medium align-middle">منذ</th>
              <th className="h-10 px-3 text-right font-medium align-middle">
                <span className="sr-only">إجراءات</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-t border-border hover:bg-muted/30 transition-colors"
              >
                <td className="h-12 px-3 align-middle font-mono text-xs">
                  {row.reference_number}
                </td>
                <td className="h-12 px-3 align-middle">
                  <div>{row.full_name}</div>
                  <a
                    href={`mailto:${row.email}`}
                    className="text-xs text-muted-foreground hover:underline"
                    dir="ltr"
                  >
                    {row.email}
                  </a>
                </td>
                <td className="h-12 px-3 align-middle">{row.building_name}</td>
                <td className="h-12 px-3 align-middle">
                  <div className="text-xs">
                    {row.tier_id} · {row.cycle === 'monthly' ? 'شهري' : 'سنوي'}
                  </div>
                </td>
                <td className="h-12 px-3 align-middle tabular-nums">
                  {formatCurrency(Number(row.total_amount))}
                </td>
                <td className="h-12 px-3 align-middle">
                  <OrderStatusBadge status={row.status} />
                </td>
                <td className="h-12 px-3 align-middle text-xs text-muted-foreground">
                  <span title={formatDateTime(row.created_at)}>
                    {formatRelative(row.created_at)}
                  </span>
                </td>
                <td className="h-12 px-3 align-middle">
                  <Link
                    href={`/super-admin/orders/${row.id}`}
                    className="inline-flex items-center gap-1 text-xs text-foreground hover:underline"
                  >
                    التفاصيل
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
    </>
  )
}
