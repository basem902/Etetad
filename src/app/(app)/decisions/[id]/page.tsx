import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronRight, Vote as VoteIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId, getUserBuildings } from '@/lib/tenant'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared/page-header'
import { getDecision } from '@/lib/queries/governance'
import { formatDate, formatDateTime } from '@/lib/format'
import type { DecisionStatus } from '@/types/database'

const STATUS_CFG: Record<
  DecisionStatus,
  { label: string; variant: 'default' | 'success' | 'warning' | 'destructive' | 'secondary' }
> = {
  approved: { label: 'معتمد', variant: 'success' },
  rejected: { label: 'مرفوض', variant: 'destructive' },
  implemented: { label: 'مُنفَّذ', variant: 'secondary' },
  postponed: { label: 'مُؤجَّل', variant: 'warning' },
}

export const metadata: Metadata = {
  title: 'تفاصيل القرار · نظام إدارة العمارة',
}

export default async function DecisionDetailPage({
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

  const decision = await getDecision(buildingId, id)
  if (!decision) notFound()

  const cfg = STATUS_CFG[decision.status]

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">
        <Link
          href="/decisions"
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4 lucide-chevron-right" />
          العودة إلى القرارات
        </Link>
      </div>

      <PageHeader
        title={decision.title}
        description={`صدر بتاريخ ${formatDate(decision.decision_date)} · سَجَّله ${decision.created_by_name ?? '—'}`}
        actions={<Badge variant={cfg.variant}>{cfg.label}</Badge>}
      />

      {decision.description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">الوصف</CardTitle>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">
            {decision.description}
          </CardContent>
        </Card>
      )}

      {decision.vote_id && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <VoteIcon className="h-4 w-4" />
              التصويت المُنبثِق عنه
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link
              href={`/votes/${decision.vote_id}`}
              className="text-primary hover:underline"
            >
              {decision.vote_title ?? 'عرض التصويت'}
            </Link>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">معلومات السجل</CardTitle>
        </CardHeader>
        <CardContent className="text-sm grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-muted-foreground">تاريخ التسجيل</div>
            <div>{formatDateTime(decision.created_at)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">المُسجِّل</div>
            <div>{decision.created_by_name ?? '—'}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
