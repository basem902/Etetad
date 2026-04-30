import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId, getUserBuildings } from '@/lib/tenant'
import { hasRole, isSuperAdmin } from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/shared/page-header'
import { TasksBoard } from '@/components/tasks/tasks-board'
import { listTasks } from '@/lib/queries/tasks'

export const metadata: Metadata = {
  title: 'المهام · نظام إدارة العمارة',
}

export default async function TasksPage() {
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

  // RLS already restricts: admin/committee see all, others see only their assigned tasks.
  const tasks = await listTasks(buildingId)

  return (
    <div className="space-y-6">
      <PageHeader
        title="المهام"
        description={
          canManage
            ? 'مهام إدارة العمارة. أنشئ مهام جديدة وأَسندها للأعضاء.'
            : 'مهامك المُسندة فقط.'
        }
        actions={
          canManage ? (
            <Button asChild size="sm">
              <Link href="/tasks/new">
                <Plus className="h-4 w-4" />
                مهمة جديدة
              </Link>
            </Button>
          ) : undefined
        }
      />

      {tasks.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-8 text-center">
          <h3 className="font-medium">لا توجد مهام</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {canManage ? 'ابدأ بإنشاء مهمة جديدة.' : 'لم تُسند لك أي مهمة بعد.'}
          </p>
        </div>
      ) : (
        <TasksBoard
          tasks={tasks}
          canUpdate={canManage}
          currentUserId={user.id}
        />
      )}
    </div>
  )
}
