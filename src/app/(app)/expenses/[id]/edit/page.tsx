import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId, getUserBuildings } from '@/lib/tenant'
import { hasRole, isSuperAdmin } from '@/lib/permissions'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/shared/page-header'
import { ExpenseForm } from '@/components/expenses/expense-form'
import {
  getExpense,
  listVendorsForBuilding,
  listExpenseCategories,
} from '@/lib/queries/expenses'

export const metadata: Metadata = {
  title: 'تعديل المصروف · نظام إدارة العمارة',
}

export default async function EditExpensePage({
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

  const canManage =
    (await isSuperAdmin(user.id)) ||
    (await hasRole(buildingId, ['admin', 'treasurer'], user.id))
  if (!canManage) redirect(`/expenses/${id}`)

  const expense = await getExpense(buildingId, id)
  if (!expense) notFound()

  // Editing only allowed in draft / rejected (action enforces this too).
  if (expense.status !== 'draft' && expense.status !== 'rejected') {
    redirect(`/expenses/${id}`)
  }

  const [vendors, categories] = await Promise.all([
    listVendorsForBuilding(buildingId),
    listExpenseCategories(buildingId),
  ])

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title={`تعديل: ${expense.title}`}
        description={
          expense.status === 'rejected'
            ? 'المصروف مرفوض. عدّل البيانات حسب ملاحظة المراجِع ثم أعد الإرسال.'
            : 'مسودّة قابلة للتعديل قبل الإرسال للمراجعة.'
        }
      />
      <Card>
        <CardContent className="pt-6">
          <ExpenseForm
            vendors={vendors}
            categorySuggestions={categories}
            initial={{
              id: expense.id,
              title: expense.title,
              description: expense.description,
              category: expense.category,
              amount: Number(expense.amount),
              expense_date: expense.expense_date,
              vendor_id: expense.vendor_id,
              invoice_url: expense.invoice_url,
            }}
            editing
          />
        </CardContent>
      </Card>
    </div>
  )
}
