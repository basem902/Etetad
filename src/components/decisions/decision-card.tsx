import Link from 'next/link'
import { Gavel, Vote as VoteIcon, Calendar } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/format'
import type { DecisionStatus } from '@/types/database'
import type { DecisionRow } from '@/lib/queries/governance'

const STATUS_CFG: Record<
  DecisionStatus,
  { label: string; variant: 'default' | 'success' | 'warning' | 'destructive' | 'secondary' }
> = {
  approved: { label: 'معتمد', variant: 'success' },
  rejected: { label: 'مرفوض', variant: 'destructive' },
  implemented: { label: 'مُنفَّذ', variant: 'secondary' },
  postponed: { label: 'مُؤجَّل', variant: 'warning' },
}

interface Props {
  decision: DecisionRow
}

export function DecisionCard({ decision: d }: Props) {
  const cfg = STATUS_CFG[d.status]
  return (
    <Card className="overflow-hidden hover:bg-muted/30 transition-colors">
      <CardContent className="p-4">
        <Link href={`/decisions/${d.id}`} className="block space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-medium truncate flex-1 flex items-center gap-1">
              <Gavel className="h-4 w-4 text-muted-foreground shrink-0" />
              {d.title}
            </h3>
            <Badge variant={cfg.variant} className="shrink-0">
              {cfg.label}
            </Badge>
          </div>

          {d.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {d.description}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1 truncate">
              <Calendar className="h-3 w-3 shrink-0" />
              {formatDate(d.decision_date)}
            </span>
            {d.vote_title && (
              <span className="flex items-center gap-1 truncate">
                <VoteIcon className="h-3 w-3 shrink-0" />
                من تصويت
              </span>
            )}
          </div>
        </Link>
      </CardContent>
    </Card>
  )
}
