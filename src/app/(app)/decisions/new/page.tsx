import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId, getUserBuildings } from '@/lib/tenant'
import { hasRole, isSuperAdmin } from '@/lib/permissions'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/shared/page-header'
import { DecisionForm } from '@/components/decisions/decision-form'

export const metadata: Metadata = {
  title: 'قرار جديد · نظام إدارة العمارة',
}

export default async function NewDecisionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const buildings = await getUserBuildings(user.id)
  if (buildings.length === 0) redirect('/onboarding')

  const buildingId = (await getActiveBuildingId()) ?? buildings[0]?.building_id
  if (!buildingId) redirect('/onboarding')

  const canManage =
    (await isSuperAdmin(user.id)) ||
    (await hasRole(buildingId, ['admin', 'committee'], user.id))
  if (!canManage) redirect('/decisions')

  // Closed votes available to link
  const { data: closedVotes } = await supabase
    .from('votes')
    .select('id, title')
    .eq('building_id', buildingId)
    .eq('status', 'closed')
    .order('created_at', { ascending: false })

  const sp = await searchParams
  const fromVoteRaw = sp.from_vote
  const fromVote = typeof fromVoteRaw === 'string' ? fromVoteRaw : undefined

  // If linked from a vote, prefill title with vote title
  let defaultTitle: string | undefined
  if (fromVote) {
    const v = (closedVotes ?? []).find((cv) => cv.id === fromVote)
    if (v) defaultTitle = `قرار حول: ${v.title}`
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="قرار جديد"
        description="سجّل قراراً رسمياً. اربطه بتصويت مغلق لو كان نتيجته."
      />
      <Card>
        <CardContent className="pt-6">
          <DecisionForm
            closedVotes={closedVotes ?? []}
            defaultVoteId={fromVote}
            defaultTitle={defaultTitle}
          />
        </CardContent>
      </Card>
    </div>
  )
}
