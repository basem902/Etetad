import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId, getUserBuildings } from '@/lib/tenant'
import { hasRole, isSuperAdmin } from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/shared/page-header'
import { PaymentsFilters } from '@/components/payments/payments-filters'
import { PaymentsTable } from '@/components/payments/payments-table'
import { PendingPayments } from '@/components/payments/pending-payments'
import {
  listApartmentsForPayment,
  listPayments,
  listPendingPayments,
  type PaymentsFilters as Filters,
} from '@/lib/queries/payments'
import type { PaymentMethod, PaymentStatus } from '@/types/database'

export const metadata: Metadata = {
  title: 'المدفوعات · نظام إدارة العمارة',
}

const VALID_STATUSES: PaymentStatus[] = ['pending', 'approved', 'rejected']
const VALID_METHODS: PaymentMethod[] = ['cash', 'bank_transfer', 'online', 'cheque']

function single(
  sp: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const v = sp[key]
  return Array.isArray(v) ? v[0] : v
}

export default async function PaymentsPage({
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

  const isPrivileged =
    (await isSuperAdmin(user.id)) ||
    (await hasRole(buildingId, ['admin', 'treasurer', 'committee'], user.id))
  const canApprove =
    (await isSuperAdmin(user.id)) ||
    (await hasRole(buildingId, ['admin', 'treasurer'], user.id))

  const sp = await searchParams
  const statusRaw = single(sp, 'status')
  const methodRaw = single(sp, 'method')
  const apartmentRaw = single(sp, 'apartment')
  const monthRaw = single(sp, 'month')
  const pageRaw = single(sp, 'page')

  const filters: Filters = {
    status: VALID_STATUSES.includes(statusRaw as PaymentStatus)
      ? (statusRaw as PaymentStatus)
      : undefined,
    method: VALID_METHODS.includes(methodRaw as PaymentMethod)
      ? (methodRaw as PaymentMethod)
      : undefined,
    apartmentId: apartmentRaw && apartmentRaw !== 'all' ? apartmentRaw : undefined,
    periodMonth: monthRaw && /^\d{4}-\d{2}$/.test(monthRaw) ? `${monthRaw}-01` : undefined,
    page: pageRaw ? Math.max(1, Number(pageRaw) || 1) : 1,
    pageSize: 20,
  }

  const [{ rows, total, page, pageSize }, pending, apartments] = await Promise.all([
    listPayments(buildingId, filters),
    canApprove ? listPendingPayments(buildingId, 20) : Promise.resolve([]),
    isPrivileged ? listApartmentsForPayment(buildingId, user.id, true) : Promise.resolve([]),
  ])

  // Sanitize searchParams for pagination links (only string values).
  const cleanedSearch: Record<string, string | undefined> = {
    status: typeof statusRaw === 'string' ? statusRaw : undefined,
    method: typeof methodRaw === 'string' ? methodRaw : undefined,
    apartment: typeof apartmentRaw === 'string' ? apartmentRaw : undefined,
    month: typeof monthRaw === 'string' ? monthRaw : undefined,
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="المدفوعات"
        description={
          isPrivileged
            ? 'تتبّع كل الدفعات في العمارة، اعتمدها أو ارفضها.'
            : 'تتبّع دفعاتك ودفعات شقتك.'
        }
        actions={
          <Button asChild size="sm">
            <Link href="/payments/new">
              <Plus className="h-4 w-4" />
              تسجيل دفعة
            </Link>
          </Button>
        }
      />

      {canApprove && <PendingPayments rows={pending} />}

      <PaymentsFilters
        apartments={apartments}
        showApartmentFilter={isPrivileged}
      />

      <PaymentsTable
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        searchParams={cleanedSearch}
      />
    </div>
  )
}
