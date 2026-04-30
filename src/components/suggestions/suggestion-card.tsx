import Link from 'next/link'
import { MessageSquare, User, Calendar, Vote } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/format'
import type { SuggestionStatus } from '@/types/database'
import type { SuggestionRow } from '@/lib/queries/governance'

const STATUS_CFG: Record<
  SuggestionStatus,
  { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' }
> = {
  new: { label: 'جديد', variant: 'default' },
  discussion: { label: 'نقاش', variant: 'warning' },
  pricing: { label: 'تسعير', variant: 'warning' },
  converted_to_vote: { label: 'تم تحويله لتصويت', variant: 'secondary' },
  approved: { label: 'معتمد', variant: 'success' },
  rejected: { label: 'مرفوض', variant: 'destructive' },
  archived: { label: 'مؤرشف', variant: 'secondary' },
}

interface Props {
  suggestion: SuggestionRow
}

export function SuggestionCard({ suggestion: s }: Props) {
  const cfg = STATUS_CFG[s.status]
  return (
    <Card className="overflow-hidden hover:bg-muted/30 transition-colors">
      <CardContent className="p-4">
        <Link href={`/suggestions/${s.id}`} className="block space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-medium truncate flex-1 flex items-center gap-1">
              <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
              {s.title}
            </h3>
            <Badge variant={cfg.variant} className="shrink-0">
              {cfg.label}
            </Badge>
          </div>

          {s.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {s.description}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            {s.created_by_name && (
              <span className="flex items-center gap-1 truncate">
                <User className="h-3 w-3 shrink-0" />
                {s.created_by_name}
              </span>
            )}
            <span className="flex items-center gap-1 truncate">
              <Calendar className="h-3 w-3 shrink-0" />
              {formatDate(s.created_at)}
            </span>
          </div>

          {s.linked_vote_id && (
            <div className="text-xs text-primary inline-flex items-center gap-1">
              <Vote className="h-3 w-3" />
              مرتبط بتصويت
            </div>
          )}
        </Link>
      </CardContent>
    </Card>
  )
}
