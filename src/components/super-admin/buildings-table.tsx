import Link from 'next/link'
import { ChevronLeft, AlertTriangle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
import {
  SubscriptionStatusBadge,
  SubscriptionPlanBadge,
} from '@/components/super-admin/subscription-badges'
import { formatDate } from '@/lib/format'
import type { BuildingRow } from '@/lib/queries/super-admin'

interface Props {
  rows: BuildingRow[]
}

// =============================================
// Trial-ends-soon badge
// =============================================
// Highlights buildings whose trial ends in <= 7 days. trial_warnings.tsx uses
// the same threshold against the platform_stats RPC, so the dashboard counter
// and the per-row indicator stay aligned.
// =============================================
function isTrialEndingSoon(row: BuildingRow): boolean {
  if (row.subscription_status !== 'trial') return false
  if (!row.trial_ends_at) return false
  const ends = new Date(row.trial_ends_at).getTime()
  const sevenDays = 7 * 24 * 60 * 60 * 1000
  return ends > Date.now() && ends - Date.now() < sevenDays
}

export function BuildingsTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="لا توجد عمارات مطابقة"
        description="جرّب تغيير الفلاتر أو البحث باسم آخر."
      />
    )
  }

  return (
    <>
      {/* Mobile: card stack */}
      <div className="md:hidden space-y-3">
        {rows.map((b) => {
          const trialSoon = isTrialEndingSoon(b)
          return (
            <Link
              key={b.id}
              href={`/super-admin/buildings/${b.id}`}
              className="block"
            >
              <Card className="hover:bg-muted/30 transition-colors">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold truncate">{b.name}</div>
                    <SubscriptionPlanBadge plan={b.subscription_plan} />
                  </div>
                  <div className="flex items-center gap-2">
                    <SubscriptionStatusBadge status={b.subscription_status} />
                    {trialSoon && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-warning">
                        <AlertTriangle className="h-3 w-3" />
                        تنتَهي قريباً
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground pt-1 border-t border-border">
                    <span>تَجربة: {formatDate(b.trial_ends_at) || '—'}</span>
                    <span>اشتراك: {formatDate(b.subscription_ends_at) || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      أُنشئت {formatDate(b.created_at)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-foreground">
                      التفاصيل
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      {/* Desktop: table */}
      <Card className="overflow-hidden hidden md:block">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="h-10 px-3 text-right font-medium align-middle">العمارة</th>
              <th className="h-10 px-3 text-right font-medium align-middle">الخطة</th>
              <th className="h-10 px-3 text-right font-medium align-middle">الحالة</th>
              <th className="h-10 px-3 text-right font-medium align-middle">انتهاء التجربة</th>
              <th className="h-10 px-3 text-right font-medium align-middle">انتهاء الاشتراك</th>
              <th className="h-10 px-3 text-right font-medium align-middle">أُنشئت</th>
              <th className="h-10 px-3 text-right font-medium align-middle">
                <span className="sr-only">تفاصيل</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const trialSoon = isTrialEndingSoon(b)
              return (
                <tr
                  key={b.id}
                  className="border-t border-border hover:bg-muted/30 transition-colors"
                >
                  <td className="h-12 px-3 align-middle font-medium">
                    <Link
                      href={`/super-admin/buildings/${b.id}`}
                      className="hover:underline"
                    >
                      {b.name}
                    </Link>
                  </td>
                  <td className="h-12 px-3 align-middle">
                    <SubscriptionPlanBadge plan={b.subscription_plan} />
                  </td>
                  <td className="h-12 px-3 align-middle">
                    <div className="flex items-center gap-2">
                      <SubscriptionStatusBadge status={b.subscription_status} />
                      {trialSoon && (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] text-warning"
                          aria-label="تنتهي تجربتها قريباً"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          قريب
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="h-12 px-3 align-middle text-xs text-muted-foreground">
                    {formatDate(b.trial_ends_at)}
                  </td>
                  <td className="h-12 px-3 align-middle text-xs text-muted-foreground">
                    {formatDate(b.subscription_ends_at)}
                  </td>
                  <td className="h-12 px-3 align-middle text-xs text-muted-foreground">
                    {formatDate(b.created_at)}
                  </td>
                  <td className="h-12 px-3 align-middle">
                    <Link
                      href={`/super-admin/buildings/${b.id}`}
                      className="inline-flex items-center gap-1 text-xs text-foreground hover:underline"
                    >
                      التفاصيل
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
    </>
  )
}
