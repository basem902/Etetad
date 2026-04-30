import Link from 'next/link'
import { ArrowLeft, FileSpreadsheet } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
import { ExpenseStatusBadge } from '@/components/dashboard/status-badges'
import { formatCurrency, formatDate } from '@/lib/format'
import { getRecentExpenses } from '@/lib/queries/dashboard'

export async function RecentExpenses({ buildingId }: { buildingId: string }) {
  const items = await getRecentExpenses(buildingId, 5)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">آخر المصروفات</CardTitle>
        <Link
          href="/expenses"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
        >
          عرض الكل
          <ArrowLeft className="h-3 w-3 lucide-arrow-left" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState
            icon={FileSpreadsheet}
            title="لا توجد مصروفات بعد"
            description="ستظهر هنا أحدث 5 مصروفات."
            className="py-8"
          />
        ) : (
          <ul className="space-y-3">
            {items.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 text-sm border-b border-border pb-3 last:border-b-0 last:pb-0"
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="font-medium truncate">{e.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {e.category ?? 'بدون تصنيف'} · {formatDate(e.expense_date)}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <ExpenseStatusBadge status={e.status} />
                  <span className="font-semibold tabular-nums">
                    {formatCurrency(Number(e.amount))}
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
