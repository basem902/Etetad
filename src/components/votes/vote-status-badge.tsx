import { Badge } from '@/components/ui/badge'
import type { VoteStatus } from '@/types/database'

const CFG: Record<
  VoteStatus,
  { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' }
> = {
  draft: { label: 'مسودة', variant: 'secondary' },
  active: { label: 'نشط', variant: 'warning' },
  closed: { label: 'مغلق', variant: 'success' },
  cancelled: { label: 'ملغى', variant: 'destructive' },
}

export function VoteStatusBadge({ status }: { status: VoteStatus }) {
  const c = CFG[status]
  return <Badge variant={c.variant}>{c.label}</Badge>
}
