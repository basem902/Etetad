import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/empty-state'
import { ExpenseStatusBadge } from './expense-status-badge'
import { formatCurrency, formatDate } from '@/lib/format'
import type { ExpenseRow } from '@/lib/queries/expenses'

interface Props {
  rows: ExpenseRow[]
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

export function ExpensesTable({
  rows,
  total,
  page,
  pageSize,
  baseHref = '/expenses',
  searchParams = {},
}: Props) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="لا توجد مصروفات"
        description="جرّب تغيير الفلاتر، أو سجّل مصروفاً جديداً."
      />
    )
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const fromCount = (page - 1) * pageSize + 1
  const toCount = Math.min(page * pageSize, total)

  return (
    <div className="space-y-3">
      {/* Mobile: card stack */}
      <div className="md:hidden space-y-3">
        {rows.map((e) => (
          <Link key={e.id} href={`/expenses/${e.id}`} className="block">
            <Card className="hover:bg-muted/30 transition-colors">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{e.title}</div>
                    {e.category && (
                      <div className="text-xs text-muted-foreground truncate">
                        {e.category}
                      </div>
                    )}
                  </div>
                  <ExpenseStatusBadge status={e.status} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold tabular-nums">
                    {formatCurrency(Number(e.amount))}
                  </span>
                  {e.vendor_name && (
                    <span className="text-xs text-muted-foreground truncate max-w-[50%]">
                      {e.vendor_name}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border">
                  <span>{formatDate(e.expense_date)}</span>
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
                <th className="h-10 px-3 text-right font-medium">التاريخ</th>
                <th className="h-10 px-3 text-right font-medium">العنوان</th>
                <th className="h-10 px-3 text-right font-medium">التصنيف</th>
                <th className="h-10 px-3 text-right font-medium">المورد</th>
                <th className="h-10 px-3 text-right font-medium">المبلغ</th>
                <th className="h-10 px-3 text-right font-medium">الحالة</th>
                <th className="h-10 px-3 text-right font-medium">
                  <span className="sr-only">إجراءات</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr
                  key={e.id}
                  className="border-t border-border hover:bg-muted/30 transition-colors"
                >
                  <td className="h-12 px-3 align-middle whitespace-nowrap">
                    {formatDate(e.expense_date)}
                  </td>
                  <td className="h-12 px-3 align-middle">
                    <Link
                      href={`/expenses/${e.id}`}
                      className="font-medium hover:underline truncate block max-w-[260px]"
                    >
                      {e.title}
                    </Link>
                  </td>
                  <td className="h-12 px-3 align-middle text-xs text-muted-foreground">
                    {e.category ?? '—'}
                  </td>
                  <td className="h-12 px-3 align-middle text-xs text-muted-foreground">
                    {e.vendor_name ?? '—'}
                  </td>
                  <td className="h-12 px-3 align-middle font-semibold tabular-nums">
                    {formatCurrency(Number(e.amount))}
                  </td>
                  <td className="h-12 px-3 align-middle">
                    <ExpenseStatusBadge status={e.status} />
                  </td>
                  <td className="h-12 px-3 align-middle">
                    <Link
                      href={`/expenses/${e.id}`}
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
