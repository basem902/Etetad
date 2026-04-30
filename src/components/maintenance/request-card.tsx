import Link from 'next/link'
import { Wrench, MapPin, User, Calendar } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import {
  MaintenanceStatusBadge,
  PriorityBadge,
} from '@/components/dashboard/status-badges'
import { formatDate } from '@/lib/format'
import type { MaintenanceLocation } from '@/types/database'
import type { MaintenanceRow } from '@/lib/queries/maintenance'

const LOCATION_LABELS: Record<MaintenanceLocation, string> = {
  apartment: 'داخل شقة',
  entrance: 'المدخل',
  elevator: 'المصعد',
  roof: 'السطح',
  parking: 'الموقف',
  other: 'أخرى',
}

interface Props {
  request: MaintenanceRow
}

export function RequestCard({ request: r }: Props) {
  return (
    <Card className="overflow-hidden hover:bg-muted/30 transition-colors">
      <CardContent className="p-4">
        <Link href={`/maintenance/${r.id}`} className="block space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="font-medium truncate">{r.title}</h3>
              {r.description && (
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                  {r.description}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <MaintenanceStatusBadge status={r.status} />
              <PriorityBadge priority={r.priority} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1 truncate">
              <MapPin className="h-3 w-3 shrink-0" />
              {LOCATION_LABELS[r.location_type]}
              {r.apartment_number ? ` · شقة ${r.apartment_number}` : ''}
            </span>
            <span className="flex items-center gap-1 truncate">
              <Calendar className="h-3 w-3 shrink-0" />
              {formatDate(r.created_at)}
            </span>
            {r.requester_name && (
              <span className="flex items-center gap-1 truncate">
                <User className="h-3 w-3 shrink-0" />
                المُنشئ: {r.requester_name}
              </span>
            )}
            {r.assignee_name && (
              <span className="flex items-center gap-1 truncate">
                <Wrench className="h-3 w-3 shrink-0" />
                الفني: {r.assignee_name}
              </span>
            )}
          </div>
        </Link>
      </CardContent>
    </Card>
  )
}
