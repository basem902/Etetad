import Link from 'next/link'
import { Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/empty-state'
import { StatusActions } from './status-actions'
import { formatCurrency, formatDate } from '@/lib/format'
import type { ExpenseRow } from '@/lib/queries/expenses'

interface Props {
  rows: ExpenseRow[]
}

/**
 * Pending-review section, mirrors PendingPayments. Per §6.3 the workflow
 * makes "submitted" visually distinct from "approved" so reviewers don't
 * conflate the two on the same dashboard.
 */
export function PendingExpenses({ rows }: Props) {
  return (
    <Card className="border-warning/40 bg-warning/5">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-warning" />
            مصروفات بانتظار المراجعة
            {rows.length > 0 && (
              <Badge variant="warning" className="ms-1">
                {rows.length}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            هذه المصروفات لا تظهر في تقارير العمارة حتى تُعتمَد ثم تُدفَع.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            title="لا توجد مصروفات بانتظار المراجعة"
            description="ستظهر هنا أي مسودّة يُرسلها أمين الصندوق."
            className="py-6 bg-transparent border-warning/20"
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((e) => (
              <li
                key={e.id}
                className="flex flex-col gap-2 rounded-md border border-warning/30 bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <Link
                    href={`/expenses/${e.id}`}
                    className="font-medium hover:underline truncate"
                  >
                    {e.title} ·{' '}
                    <span className="font-semibold tabular-nums">
                      {formatCurrency(Number(e.amount))}
                    </span>
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {e.category ?? 'غير مصنّف'} · {formatDate(e.expense_date)}
                    {e.vendor_name ? ` · ${e.vendor_name}` : ''}
                  </span>
                  {e.created_by_name && (
                    <span className="text-xs text-muted-foreground">
                      المُنشئ: {e.created_by_name}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/expenses/${e.id}`}>التفاصيل</Link>
                  </Button>
                  <StatusActions expenseId={e.id} status={e.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
