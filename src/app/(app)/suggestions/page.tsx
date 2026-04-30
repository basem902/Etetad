import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId, getUserBuildings } from '@/lib/tenant'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { SuggestionCard } from '@/components/suggestions/suggestion-card'
import { listSuggestions } from '@/lib/queries/governance'
import type { SuggestionStatus } from '@/types/database'

export const metadata: Metadata = {
  title: 'الاقتراحات · نظام إدارة العمارة',
}

const VALID_STATUSES: SuggestionStatus[] = [
  'new',
  'discussion',
  'pricing',
  'converted_to_vote',
  'approved',
  'rejected',
  'archived',
]

function single(
  sp: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const v = sp[key]
  return Array.isArray(v) ? v[0] : v
}

export default async function SuggestionsPage({
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

  const sp = await searchParams
  const statusRaw = single(sp, 'status')
  const status = VALID_STATUSES.includes(statusRaw as SuggestionStatus)
    ? (statusRaw as SuggestionStatus)
    : undefined

  const suggestions = await listSuggestions(buildingId, { status })

  return (
    <div className="space-y-6">
      <PageHeader
        title="الاقتراحات"
        description="ساكنو العمارة يَطرحون أفكارهم. الإدارة تُحوِّل الأنسب إلى تصويت."
        actions={
          <Button asChild size="sm">
            <Link href="/suggestions/new">
              <Plus className="h-4 w-4" />
              اقتراح جديد
            </Link>
          </Button>
        }
      />

      {suggestions.length === 0 ? (
        <EmptyState
          title="لا توجد اقتراحات"
          description="كن أول من يَطرح فكرة لتطوير العمارة."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {suggestions.map((s) => (
            <SuggestionCard key={s.id} suggestion={s} />
          ))}
        </div>
      )}
    </div>
  )
}
