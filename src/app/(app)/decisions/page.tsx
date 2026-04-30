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
import { DecisionCard } from '@/components/decisions/decision-card'
import { listDecisions } from '@/lib/queries/governance'

export const metadata: Metadata = {
  title: 'القرارات · نظام إدارة العمارة',
}

export default async function DecisionsPage() {
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

  const decisions = await listDecisions(buildingId)

  return (
    <div className="space-y-6">
      <PageHeader
        title="القرارات"
        description="القرارات الرسمية للجمعية العمومية وللإدارة. غالباً ناتجة عن تصويت."
        actions={
          isManager && (
            <Button asChild size="sm">
              <Link href="/decisions/new">
                <Plus className="h-4 w-4" />
                قرار جديد
              </Link>
            </Button>
          )
        }
      />

      {decisions.length === 0 ? (
        <EmptyState
          title="لا توجد قرارات"
          description={
            isManager
              ? 'سَجِّل أول قرار رسمي للعمارة.'
              : 'لم تُسجَّل أي قرارات بعد.'
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {decisions.map((d) => (
            <DecisionCard key={d.id} decision={d} />
          ))}
        </div>
      )}
    </div>
  )
}
