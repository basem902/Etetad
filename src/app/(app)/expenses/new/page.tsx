import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId, getUserBuildings } from '@/lib/tenant'
import { hasRole, isSuperAdmin } from '@/lib/permissions'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/shared/page-header'
import { ExpenseForm } from '@/components/expenses/expense-form'
import {
  listVendorsForBuilding,
  listExpenseCategories,
} from '@/lib/queries/expenses'

export const metadata: Metadata = {
  title: 'مصروف جديد · نظام إدارة العمارة',
}

export default async function NewExpensePage() {
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
    (await hasRole(buildingId, ['admin', 'treasurer'], user.id))
  if (!canManage) redirect('/expenses')

  const [vendors, categories] = await Promise.all([
    listVendorsForBuilding(buildingId),
    listExpenseCategories(buildingId),
  ])

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="مصروف جديد"
        description="سيُحفظ كمسودّة. أرسله للمراجعة عند اكتمال البيانات."
      />
      <Card>
        <CardContent className="pt-6">
          <ExpenseForm vendors={vendors} categorySuggestions={categories} />
        </CardContent>
      </Card>
    </div>
  )
}
