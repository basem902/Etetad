import { Activity, CircleDot } from 'lucide-react'
import { formatDateTime } from '@/lib/format'
import { MaintenanceStatusBadge } from '@/components/dashboard/status-badges'
import type { MaintenanceTimelineEntry } from '@/lib/queries/maintenance'
import type { MaintenanceStatus } from '@/types/database'

interface Props {
  entries: MaintenanceTimelineEntry[]
}

/**
 * Reads audit_logs entries and renders a vertical timeline. We highlight
 * status transitions specifically (most informative); other field changes are
 * summarized as "تعديل بيانات".
 */
export function StatusTimeline({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        لا توجد أحداث مسجَّلة بعد.
      </div>
    )
  }

  return (
    <ol className="relative space-y-4 ps-6">
      <span
        aria-hidden
        className="absolute inset-y-1 start-[7px] w-px bg-border"
      />
      {entries.map((e) => {
        const oldStatus = (e.old_values?.status ?? null) as MaintenanceStatus | null
        const newStatus = (e.new_values?.status ?? null) as MaintenanceStatus | null
        const statusChanged = oldStatus !== newStatus && newStatus !== null

        const label =
          e.action === 'INSERT'
            ? 'إنشاء الطلب'
            : statusChanged
              ? 'تغيير الحالة'
              : 'تعديل البيانات'

        return (
          <li key={e.id} className="relative">
            <span
              aria-hidden
              className="absolute -start-6 top-1.5 flex h-4 w-4 items-center justify-center"
            >
              {statusChanged ? (
                <CircleDot className="h-4 w-4 text-primary" />
              ) : (
                <Activity className="h-4 w-4 text-muted-foreground" />
              )}
            </span>
            <div className="text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{label}</span>
                {statusChanged && newStatus && (
                  <>
                    {oldStatus && (
                      <>
                        <MaintenanceStatusBadge status={oldStatus} />
                        <span className="text-muted-foreground">←</span>
                      </>
                    )}
                    <MaintenanceStatusBadge status={newStatus} />
                  </>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {formatDateTime(e.created_at)}
                {e.actor_name ? ` · ${e.actor_name}` : ''}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
