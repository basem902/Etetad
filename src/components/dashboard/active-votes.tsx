import Link from 'next/link'
import { ArrowLeft, Vote, Check, Clock, Lock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
import { Badge } from '@/components/ui/badge'
import { formatRelative } from '@/lib/format'
import { getActiveVotesForUser } from '@/lib/queries/dashboard'

export async function ActiveVotes({
  buildingId,
  userId,
}: {
  buildingId: string
  userId: string
}) {
  const items = await getActiveVotesForUser(buildingId, userId)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">التصويتات النشطة</CardTitle>
        <Link
          href="/votes"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
        >
          عرض الكل
          <ArrowLeft className="h-3 w-3 lucide-arrow-left" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState
            icon={Vote}
            title="لا توجد تصويتات نشطة"
            description="عند بدء تصويت جديد سيظهر هنا."
            className="py-8"
          />
        ) : (
          <ul className="space-y-3">
            {items.map((v) => {
              const total = v.total_apartments
              const turnoutPct = total > 0 ? Math.round((v.apartments_voted / total) * 100) : 0
              return (
                <li
                  key={v.id}
                  className="flex items-start justify-between gap-3 text-sm border-b border-border pb-3 last:border-b-0 last:pb-0"
                >
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="font-medium truncate">{v.title}</span>
                    <span className="text-xs text-muted-foreground">
                      ينتهي {formatRelative(v.ends_at)} · {v.apartments_voted}/{total} شقق ({turnoutPct}%)
                    </span>
                  </div>
                  <div className="shrink-0">
                    {v.user_voting_status === 'voted' && (
                      <Badge variant="success" className="gap-1">
                        <Check className="h-3 w-3" /> صوّتت
                      </Badge>
                    )}
                    {v.user_voting_status === 'pending' && (
                      <Badge variant="warning" className="gap-1">
                        <Clock className="h-3 w-3" /> لم تصوّت بعد
                      </Badge>
                    )}
                    {v.user_voting_status === 'not_eligible' && (
                      <Badge variant="secondary" className="gap-1">
                        <Lock className="h-3 w-3" /> غير ممثل
                      </Badge>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
