import { Badge } from '@/components/ui/badge'
import type { ApartmentStatus, ApartmentRelation } from '@/types/database'

const STATUS_LABELS: Record<
  ApartmentStatus,
  { label: string; variant: 'success' | 'secondary' | 'warning' }
> = {
  occupied: { label: 'مأهولة', variant: 'success' },
  vacant: { label: 'شاغرة', variant: 'secondary' },
  under_maintenance: { label: 'قيد الصيانة', variant: 'warning' },
}

export function ApartmentStatusBadge({ status }: { status: ApartmentStatus }) {
  const c = STATUS_LABELS[status]
  return <Badge variant={c.variant}>{c.label}</Badge>
}

const RELATION_LABELS: Record<ApartmentRelation, string> = {
  owner: 'مالك',
  resident: 'مستأجر',
  representative: 'ممثل مفوّض',
}

export function relationLabel(relation: ApartmentRelation): string {
  return RELATION_LABELS[relation]
}
