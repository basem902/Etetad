import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronRight, Clock } from 'lucide-react'
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
import { PageHeader } from '@/components/shared/page-header'
import { VoteStatusBadge } from '@/components/votes/vote-status-badge'
import { VoteActions } from '@/components/votes/vote-actions'
import { CastVote } from '@/components/votes/cast-vote'
import { ResultsChart } from '@/components/votes/results-chart'
import { RepresentationBanner } from '@/components/votes/representation-banner'
import { VotedApartmentsList } from '@/components/votes/voted-apartments-list'
import {
  getVote,
  listVoteOptions,
  listUserVoteApartments,
  computeVoteResultsFor,
  listVoteResponsesDetail,
} from '@/lib/queries/governance'
import { formatDateTime, formatCurrency } from '@/lib/format'

const APPROVAL_LABELS = {
  simple_majority: 'أغلبية بسيطة (>50%)',
  two_thirds: 'ثلثا الأصوات (≥66.67%)',
  custom: 'نسبة مخصَّصة',
} as const

export const metadata: Metadata = {
  title: 'تفاصيل التصويت · نظام إدارة العمارة',
}

export default async function VoteDetailPage({
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

  const vote = await getVote(buildingId, id)
  if (!vote) notFound()

  const isManager =
    (await isSuperAdmin(user.id)) ||
    (await hasRole(buildingId, ['admin', 'committee'], user.id))

  // Determine who can see results: managers see real-time during active;
  // regular members see results only AFTER vote closes.
  const canSeeResults = isManager || vote.status === 'closed'

  // Codex round 3 P2: single SECURITY DEFINER RPC returns ALL apartments
  // the caller is rep for, with already-voted status (and prior voter info
  // for transparency). Replaces direct vote_responses SELECT which is now
  // restricted to admin-or-self.
  const [options, userApartments, results, voters] = await Promise.all([
    listVoteOptions(id),
    vote.status === 'active' ? listUserVoteApartments(id) : Promise.resolve([]),
    canSeeResults
      ? computeVoteResultsFor(buildingId, id, vote.approval_rule, vote.custom_threshold == null ? null : Number(vote.custom_threshold))
      : Promise.resolve(null),
    isManager ? listVoteResponsesDetail(id) : Promise.resolve([]),
  ])

  const votableApartments = userApartments
    .filter((a) => !a.already_voted)
    .map((a) => ({ apartment_id: a.apartment_id, apartment_number: a.apartment_number }))

  // For regular users: detect their representation status for the banner.
  let userIsNotRep = false
  let userAlreadyVoted:
    | { apartmentNumber: string; by: string | null; at: string; option: string }
    | null = null
  if (!isManager && vote.status === 'active' && votableApartments.length === 0) {
    if (userApartments.length === 0) {
      // Not a rep for any apartment.
      userIsNotRep = true
    } else {
      // They are a rep but all their apartments have voted. Show the first
      // already-voted apartment's prior vote info.
      const prior = userApartments.find((a) => a.already_voted)
      if (prior) {
        userAlreadyVoted = {
          apartmentNumber: prior.apartment_number,
          by: prior.voted_by_user_name,
          at: prior.voted_at ? formatDateTime(prior.voted_at) : '',
          option: prior.voted_option_label ?? '—',
        }
      }
    }
  }

  const ended = new Date(vote.ends_at).getTime() < Date.now()

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">
        <Link
          href="/votes"
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4 lucide-chevron-right" />
          العودة إلى التصويتات
        </Link>
      </div>

      <PageHeader
        title={vote.title}
        description={`أنشأه ${vote.created_by_name ?? '—'} · ${formatDateTime(vote.created_at)}`}
        actions={<VoteStatusBadge status={vote.status} />}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              قاعدة القبول
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-base font-medium">
              {APPROVAL_LABELS[vote.approval_rule]}
              {vote.approval_rule === 'custom' && vote.custom_threshold != null
                ? ` (${(Number(vote.custom_threshold) * 100).toFixed(0)}%)`
                : ''}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              ينتهي
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-base font-medium">{formatDateTime(vote.ends_at)}</div>
            {ended && vote.status === 'active' && (
              <p className="text-xs text-warning mt-1">
                انتهى الوقت — في انتظار إغلاق المدير
              </p>
            )}
          </CardContent>
        </Card>

        {vote.estimated_cost != null && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                التكلفة المتوقَّعة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-base font-medium tabular-nums">
                {formatCurrency(Number(vote.estimated_cost))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {vote.description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">الوصف</CardTitle>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">
            {vote.description}
          </CardContent>
        </Card>
      )}

      {/* Manager-only workflow actions */}
      {isManager && (vote.status === 'draft' || vote.status === 'active') && (
        <Card className="border-warning/40 bg-warning/5">
          <CardHeader>
            <CardTitle className="text-base">إجراءات المدير</CardTitle>
            <CardDescription>
              {vote.status === 'draft' && 'فعّل التصويت بعد التحقق من الخيارات.'}
              {vote.status === 'active' && 'أَغلِق التصويت بعد انتهاء الفترة.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VoteActions voteId={vote.id} status={vote.status} />
          </CardContent>
        </Card>
      )}

      {/* Cast vote (active only, for current user's apartments) */}
      {vote.status === 'active' &&
        (votableApartments.length > 0 ? (
          <CastVote
            voteId={vote.id}
            options={options}
            votableApartments={votableApartments}
          />
        ) : (
          !isManager && (
            <RepresentationBanner
              isNotRep={userIsNotRep}
              alreadyVotedBy={userAlreadyVoted?.by ?? undefined}
              alreadyVotedAt={userAlreadyVoted?.at ?? undefined}
              alreadyChosenOption={userAlreadyVoted?.option ?? undefined}
              apartmentNumber={userAlreadyVoted?.apartmentNumber ?? null}
            />
          )
        ))}

      {/* Results: real-time for managers; closed-only for residents.
          The aggregate-counts RPC enforces this server-side; null means
          the caller isn't allowed to see results yet. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">النتائج</CardTitle>
          <CardDescription>
            النتائج تُحسب بعدد الشقق (وليس عدد المستخدمين). صوت واحد لكل شقة.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {results ? (
            <ResultsChart results={results} showCounts={isManager || vote.status === 'closed'} />
          ) : (
            <p className="text-sm text-muted-foreground">
              ستظهر النتائج بعد إغلاق التصويت (خصوصية تصويتية).
            </p>
          )}
        </CardContent>
      </Card>

      {/* Manager transparency: who voted what */}
      {isManager && voters.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">تفاصيل التصويت (للمدير)</CardTitle>
            <CardDescription>
              قائمة الشقق التي صوّتت ومن صوّت ومتى. للشفافية الإدارية فقط.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <VotedApartmentsList voters={voters} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
