import Link from 'next/link'
import { AlertTriangle, ChevronLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
import { formatRelative, formatDate } from '@/lib/format'
import type { BuildingRow } from '@/lib/queries/super-admin'

interface Props {
  rows: BuildingRow[]
}

// =============================================
// Trial warnings (dashboard widget)
// =============================================
// Pre-filtered server-side to: subscription_status = 'trial' AND
// trial_ends_at < now() + 7 days. Also includes already-expired trials so
// super_admin can still see and reactivate them.
// =============================================
export function TrialWarnings({ rows }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
          تجارب قاربت على الانتهاء
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? (
          <EmptyState
            title="لا تنبيهات حالية"
            description="لا توجد عمارات تنتهي تجربتها خلال الأيام السبعة القادمة."
          />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((b) => {
              const isExpired =
                b.trial_ends_at && new Date(b.trial_ends_at).getTime() < Date.now()
              return (
                <li key={b.id} className="flex items-center justify-between py-2.5">
                  <div className="space-y-0.5">
                    <Link
                      href={`/super-admin/buildings/${b.id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {b.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      تنتهي{' '}
                      <span className={isExpired ? 'text-destructive' : 'text-warning'}>
                        {formatRelative(b.trial_ends_at)}
                      </span>
                      {' · '}
                      {formatDate(b.trial_ends_at)}
                    </div>
                  </div>
                  <Link
                    href={`/super-admin/buildings/${b.id}`}
                    className="inline-flex items-center gap-1 text-xs text-foreground hover:underline"
                  >
                    إدارة
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
