import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId, getUserBuildings } from '@/lib/tenant'
import { hasRole, isSuperAdmin } from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { VoteCard } from '@/components/votes/vote-card'
import {
  listVotes,
  countEligibleApartments,
} from '@/lib/queries/governance'
import type { VoteStatus } from '@/types/database'

export const metadata: Metadata = {
  title: 'التصويتات · نظام إدارة العمارة',
}

const VALID_STATUSES: VoteStatus[] = ['draft', 'active', 'closed', 'cancelled']

function single(
  sp: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const v = sp[key]
  return Array.isArray(v) ? v[0] : v
}

export default async function VotesPage({
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

  const isManager =
    (await isSuperAdmin(user.id)) ||
    (await hasRole(buildingId, ['admin', 'committee'], user.id))

  const sp = await searchParams
  const statusRaw = single(sp, 'status')
  const status = VALID_STATUSES.includes(statusRaw as VoteStatus)
    ? (statusRaw as VoteStatus)
    : undefined

  const [votes, eligible] = await Promise.all([
    listVotes(buildingId, { status }),
    countEligibleApartments(buildingId),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="التصويتات"
        description="صوت واحد لكل شقة عبر ممثل التصويت. النتائج تُحسب بعدد الشقق."
        actions={
          isManager && (
            <Button asChild size="sm">
              <Link href="/votes/new">
                <Plus className="h-4 w-4" />
                تصويت جديد
              </Link>
            </Button>
          )
        }
      />

      {votes.length === 0 ? (
        <EmptyState
          title="لا توجد تصويتات"
          description={
            isManager
              ? 'ابدأ تصويتاً جديداً أو حوّل اقتراحاً موجوداً.'
              : 'لم يَفتح المدير أي تصويت بعد.'
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {votes.map((v) => (
            <VoteCard key={v.id} vote={v} eligibleApartments={eligible} />
          ))}
        </div>
      )}
    </div>
  )
}
