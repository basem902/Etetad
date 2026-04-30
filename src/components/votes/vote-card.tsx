import Link from 'next/link'
import { Vote as VoteIcon, Clock, Users, CheckCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { VoteStatusBadge } from './vote-status-badge'
import { formatDateTime } from '@/lib/format'
import type { VoteRowWithCount } from '@/lib/queries/governance'

interface Props {
  vote: VoteRowWithCount
  /** Eligible apartments (denominator for turnout). */
  eligibleApartments: number
}

export function VoteCard({ vote: v, eligibleApartments }: Props) {
  const showCount = v.voted_count != null
  const turnout =
    showCount && eligibleApartments > 0
      ? Math.round((v.voted_count! / eligibleApartments) * 100)
      : null
  const ended = new Date(v.ends_at).getTime() < Date.now()

  return (
    <Card className="overflow-hidden hover:bg-muted/30 transition-colors">
      <CardContent className="p-4">
        <Link href={`/votes/${v.id}`} className="block space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-medium truncate flex-1 flex items-center gap-1">
              <VoteIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              {v.title}
            </h3>
            <VoteStatusBadge status={v.status} />
          </div>

          {v.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {v.description}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1 truncate">
              <Clock className="h-3 w-3 shrink-0" />
              {ended ? 'انتهى' : 'ينتهي'}: {formatDateTime(v.ends_at)}
            </span>
            <span className="flex items-center gap-1 truncate">
              <CheckCircle className="h-3 w-3 shrink-0" />
              {v.options_count} خيارات
            </span>
            <span className="flex items-center gap-1 truncate col-span-2">
              <Users className="h-3 w-3 shrink-0" />
              {showCount
                ? `صوّتت ${v.voted_count} من ${eligibleApartments} شقة (${turnout}%)`
                : `إجمالي ${eligibleApartments} شقة مؤهلة · النتائج بعد الإغلاق`}
            </span>
          </div>
        </Link>
      </CardContent>
    </Card>
  )
}
