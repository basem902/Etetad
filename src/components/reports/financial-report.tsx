import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Building2,
  AlertTriangle,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { formatCurrency, formatDate } from '@/lib/format'
import { ARABIC_MONTH_NAMES } from '@/lib/reports'
import type { FinancialReport } from '@/lib/queries/reports'

interface Props {
  report: FinancialReport
  periodLabel: string
}

export function FinancialReportView({ report, periodLabel }: Props) {
  const { summary, byCategory, monthlyTotals } = report
  const isYearly = monthlyTotals != null

  // For category bars
  const maxCategoryTotal = Math.max(1, ...byCategory.map((c) => c.total))
  // For monthly bars
  const maxMonthlyTotal = isYearly
    ? Math.max(
        1,
        ...monthlyTotals!.flatMap((m) => [m.income, m.expense]),
      )
    : 1

  return (
    <div className="space-y-6">
      {/* Headline KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-4 w-4 text-success" />
              الدخل
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {formatCurrency(summary.income)}
            </div>
            {summary.income_count > 0 && (
              <p className="text-xs text-muted-foreground">
                من {summary.income_count} عملية
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <TrendingDown className="h-4 w-4 text-destructive" />
              المصروف
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {formatCurrency(summary.expense)}
            </div>
            {summary.expense_count > 0 && (
              <p className="text-xs text-muted-foreground">
                من {summary.expense_count} عملية
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <Wallet className="h-4 w-4" />
              الرصيد الصافي
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold tabular-nums ${
                summary.balance >= 0 ? 'text-success' : 'text-destructive'
              }`}
            >
              {formatCurrency(summary.balance)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Outstanding apartments (monthly only) */}
      {summary.outstanding_apartments_count != null &&
        summary.outstanding_apartments_count > 0 && (
          <Card className="border-warning/40 bg-warning/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-1">
                <AlertTriangle className="h-4 w-4 text-warning" />
                متأخرات الشهر
              </CardTitle>
              <CardDescription>
                شقق نشطة لم تُسجَّل دفعتها للشهر بعد.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-muted-foreground text-xs">عدد الشقق</div>
                <div className="text-xl font-semibold tabular-nums">
                  {summary.outstanding_apartments_count}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">القيمة المتوقَّعة</div>
                <div className="text-xl font-semibold tabular-nums">
                  {formatCurrency(summary.outstanding_apartments_total ?? 0)}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

      {/* Monthly bar chart (yearly view only) */}
      {isYearly && monthlyTotals && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">دخل/مصروف شهرياً</CardTitle>
            <CardDescription>
              الأخضر = الدخل · الأحمر = المصروف
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {monthlyTotals.map((m, i) => {
                const incomePct = (m.income / maxMonthlyTotal) * 100
                const expensePct = (m.expense / maxMonthlyTotal) * 100
                const monthName = ARABIC_MONTH_NAMES[i] ?? `${i + 1}`
                return (
                  <div key={m.month_start} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{monthName}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {formatCurrency(m.income - m.expense)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      <div className="space-y-0.5">
                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-success transition-all"
                            style={{ width: `${incomePct}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {formatCurrency(m.income)}
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-destructive transition-all"
                            style={{ width: `${expensePct}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {formatCurrency(m.expense)}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top expense categories */}
      {byCategory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-1">
              <Building2 className="h-4 w-4" />
              المصروفات حسب التصنيف
            </CardTitle>
            <CardDescription>
              مرتَّبة من الأكبر للأصغر · {byCategory.length} تصنيفات
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {byCategory.map((c) => {
                const widthPct = (c.total / maxCategoryTotal) * 100
                const sharePct =
                  summary.expense > 0
                    ? Math.round((c.total / summary.expense) * 100)
                    : 0
                return (
                  <div key={c.category} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{c.category}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatCurrency(c.total)} · {sharePct}% · {c.count} عملية
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Print footer */}
      <div className="hidden print:block text-xs text-muted-foreground border-t border-border pt-3 mt-6">
        <p>
          التقرير: {periodLabel} · طُبع: {formatDate(new Date().toISOString().slice(0, 10))}
        </p>
      </div>
    </div>
  )
}
