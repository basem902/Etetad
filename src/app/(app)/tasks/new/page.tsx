import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId, getUserBuildings } from '@/lib/tenant'
import { hasRole, isSuperAdmin } from '@/lib/permissions'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/shared/page-header'
import { TaskForm } from '@/components/tasks/task-form'
import { listTaskAssignees } from '@/lib/queries/tasks'

export const metadata: Metadata = {
  title: 'مهمة جديدة · نظام إدارة العمارة',
}

export default async function NewTaskPage() {
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
  if (!canManage) redirect('/tasks')

  const assignees = await listTaskAssignees(buildingId)

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="مهمة جديدة"
        description="أنشئ مهمة لإدارة العمارة. يمكنك إسنادها لعضو لجنة أو أمين الصندوق."
      />
      <Card>
        <CardContent className="pt-6">
          <TaskForm assignees={assignees} />
        </CardContent>
      </Card>
    </div>
  )
}
