import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId, getUserBuildings } from '@/lib/tenant'
import { hasRole, isSuperAdmin } from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/shared/page-header'
import { ExpensesFilters } from '@/components/expenses/expenses-filters'
import { ExpensesTable } from '@/components/expenses/expenses-table'
import { PendingExpenses } from '@/components/expenses/pending-expenses'
import {
  listExpenses,
  listPendingExpenses,
  listVendorsForBuilding,
  listExpenseCategories,
  type ExpensesFilters as Filters,
} from '@/lib/queries/expenses'
import type { ExpenseStatus } from '@/types/database'

export const metadata: Metadata = {
  title: 'المصروفات · نظام إدارة العمارة',
}

const VALID_STATUSES: ExpenseStatus[] = [
  'draft',
  'pending_review',
  'approved',
  'rejected',
  'paid',
  'cancelled',
]

function single(
  sp: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const v = sp[key]
  return Array.isArray(v) ? v[0] : v
}

export default async function ExpensesPage({
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
    (await hasRole(buildingId, ['admin', 'treasurer'], user.id))

  const sp = await searchParams
  const statusRaw = single(sp, 'status')
  const categoryRaw = single(sp, 'category')
  const vendorRaw = single(sp, 'vendor')
  const fromRaw = single(sp, 'from')
  const toRaw = single(sp, 'to')
  const pageRaw = single(sp, 'page')

  const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)

  const filters: Filters = {
    status: VALID_STATUSES.includes(statusRaw as ExpenseStatus)
      ? (statusRaw as ExpenseStatus)
      : undefined,
    category: categoryRaw && categoryRaw !== 'all' ? categoryRaw : undefined,
    vendorId: vendorRaw && vendorRaw !== 'all' ? vendorRaw : undefined,
    dateFrom: fromRaw && isYmd(fromRaw) ? fromRaw : undefined,
    dateTo: toRaw && isYmd(toRaw) ? toRaw : undefined,
    page: pageRaw ? Math.max(1, Number(pageRaw) || 1) : 1,
    pageSize: 20,
  }

  const [{ rows, total, page, pageSize }, pending, vendors, categories] =
    await Promise.all([
      listExpenses(buildingId, filters),
      canManage ? listPendingExpenses(buildingId, 20) : Promise.resolve([]),
      listVendorsForBuilding(buildingId),
      listExpenseCategories(buildingId),
    ])

  const cleanedSearch: Record<string, string | undefined> = {
    status: typeof statusRaw === 'string' ? statusRaw : undefined,
    category: typeof categoryRaw === 'string' ? categoryRaw : undefined,
    vendor: typeof vendorRaw === 'string' ? vendorRaw : undefined,
    from: typeof fromRaw === 'string' ? fromRaw : undefined,
    to: typeof toRaw === 'string' ? toRaw : undefined,
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="المصروفات"
        description={
          canManage
            ? 'تتبّع كل المصروفات، وادر دورة الاعتماد والدفع.'
            : 'مصروفات العمارة (للقراءة فقط).'
        }
        actions={
          canManage && (
            <Button asChild size="sm">
              <Link href="/expenses/new">
                <Plus className="h-4 w-4" />
                مصروف جديد
              </Link>
            </Button>
          )
        }
      />

      {canManage && <PendingExpenses rows={pending} />}

      <ExpensesFilters vendors={vendors} categories={categories} />

      <ExpensesTable
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        searchParams={cleanedSearch}
      />
    </div>
  )
}
