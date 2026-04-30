import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId, getUserBuildings } from '@/lib/tenant'
import { hasRole, isSuperAdmin } from '@/lib/permissions'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared/page-header'
import { ConvertToVoteDialog } from '@/components/suggestions/convert-to-vote-dialog'
import { StatusActions } from '@/components/suggestions/status-actions'
import { getSuggestion } from '@/lib/queries/governance'
import { formatDateTime } from '@/lib/format'
import type { SuggestionStatus } from '@/types/database'

const STATUS_LABELS: Record<SuggestionStatus, string> = {
  new: 'جديد',
  discussion: 'نقاش',
  pricing: 'تسعير',
  converted_to_vote: 'تم تحويله لتصويت',
  approved: 'معتمد',
  rejected: 'مرفوض',
  archived: 'مؤرشف',
}

export const metadata: Metadata = {
  title: 'تفاصيل الاقتراح · نظام إدارة العمارة',
}

export default async function SuggestionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const buildings = await getUserBuildings(user.id)
  if (buildings.length === 0) redirect('/onboarding')

  const buildingId = (await getActiveBuildingId()) ?? buildings[0]?.building_id
  if (!buildingId) redirect('/onboarding')

  const suggestion = await getSuggestion(buildingId, id)
  if (!suggestion) notFound()

  const isManager =
    (await isSuperAdmin(user.id)) ||
    (await hasRole(buildingId, ['admin', 'committee'], user.id))

  const canConvert =
    isManager &&
    (suggestion.status === 'new' ||
      suggestion.status === 'discussion' ||
      suggestion.status === 'pricing')

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">
        <Link
          href="/suggestions"
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4 lucide-chevron-right" />
          العودة إلى الاقتراحات
        </Link>
      </div>

      <PageHeader
        title={suggestion.title}
        description={`اقترحه ${suggestion.created_by_name ?? '—'} · ${formatDateTime(suggestion.created_at)}`}
        actions={<Badge variant="default">{STATUS_LABELS[suggestion.status]}</Badge>}
      />

      {suggestion.description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">الوصف</CardTitle>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">
            {suggestion.description}
          </CardContent>
        </Card>
      )}

      {isManager && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">إجراءات الإدارة</CardTitle>
            <CardDescription>
              {canConvert
                ? 'حوّل الاقتراح إلى تصويت رسمي، أو غيّر حالته إلى نقاش/تسعير/رفض/أرشفة.'
                : 'غيّر حالة الاقتراح حسب اللزوم.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            {canConvert && (
              <ConvertToVoteDialog
                suggestionId={suggestion.id}
                defaultTitle={suggestion.title}
                defaultDescription={suggestion.description}
              />
            )}
            <StatusActions
              suggestionId={suggestion.id}
              currentStatus={suggestion.status}
            />
          </CardContent>
        </Card>
      )}

      {suggestion.linked_vote_id && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">التصويت المرتبط</CardTitle>
          </CardHeader>
          <CardContent>
            <Link
              href={`/votes/${suggestion.linked_vote_id}`}
              className="text-primary hover:underline"
            >
              عرض التصويت
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
