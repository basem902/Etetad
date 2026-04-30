import Link from 'next/link'
import { ArrowLeft, Wrench } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
import {
  MaintenanceStatusBadge,
  PriorityBadge,
} from '@/components/dashboard/status-badges'
import { formatRelative } from '@/lib/format'
import {
  getRecentMaintenance,
  type RecentMaintenance,
} from '@/lib/queries/dashboard'

interface Props {
  buildingId: string
  /** When set, restrict to maintenance assigned to this user. */
  assignedTo?: string
  /** When set, restrict to maintenance requested by this user. */
  requestedBy?: string
  /** Title override (e.g., "المسندة لي" for technician). */
  title?: string
  /** When true, only open statuses are shown. */
  onlyOpen?: boolean
  /** Override fetched data (used by parents that already have it). */
  items?: RecentMaintenance[]
}

export async function RecentMaintenance({
  buildingId,
  assignedTo,
  requestedBy,
  title = 'آخر طلبات الصيانة',
  onlyOpen,
  items: provided,
}: Props) {
  const items =
    provided ??
    (await getRecentMaintenance(buildingId, {
      limit: 5,
      assignedTo,
      requestedBy,
      onlyOpen,
    }))

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        <Link
          href="/maintenance"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
        >
          عرض الكل
          <ArrowLeft className="h-3 w-3 lucide-arrow-left" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title="لا توجد طلبات"
            description="عند فتح طلب صيانة جديد سيظهر هنا."
            className="py-8"
          />
        ) : (
          <ul className="space-y-3">
            {items.map((m) => (
              <li
                key={m.id}
                className="flex items-start justify-between gap-3 text-sm border-b border-border pb-3 last:border-b-0 last:pb-0"
              >
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="font-medium truncate">{m.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {m.apartment_number ? `شقة ${m.apartment_number} · ` : 'مرفق عام · '}
                    {formatRelative(m.created_at)}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <MaintenanceStatusBadge status={m.status} />
                  <PriorityBadge priority={m.priority} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
