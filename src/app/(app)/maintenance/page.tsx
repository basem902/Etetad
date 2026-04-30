import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId, getUserBuildings } from '@/lib/tenant'
import { hasRole, isSuperAdmin } from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { MaintenanceFilters } from '@/components/maintenance/maintenance-filters'
import { RequestCard } from '@/components/maintenance/request-card'
import {
  listMaintenanceRequests,
  listTechnicians,
  type MaintenanceFilters as Filters,
} from '@/lib/queries/maintenance'
import type {
  MaintenanceLocation,
  MaintenancePriority,
  MaintenanceStatus,
} from '@/types/database'

export const metadata: Metadata = {
  title: 'الصيانة · نظام إدارة العمارة',
}

const VALID_STATUSES: MaintenanceStatus[] = [
  'new',
  'reviewing',
  'waiting_quote',
  'waiting_approval',
  'in_progress',
  'completed',
  'rejected',
  'reopened',
]
const VALID_PRIORITIES: MaintenancePriority[] = ['low', 'medium', 'high', 'urgent']
const VALID_LOCATIONS: MaintenanceLocation[] = [
  'apartment',
  'entrance',
  'elevator',
  'roof',
  'parking',
  'other',
]

function single(
  sp: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const v = sp[key]
  return Array.isArray(v) ? v[0] : v
}

function buildHref(
  basePath: string,
  searchParams: Record<string, string | undefined>,
  overrides: Record<string, string | number>,
): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams)) if (v) sp.set(k, v)
  for (const [k, v] of Object.entries(overrides)) sp.set(k, String(v))
  const qs = sp.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

export default async function MaintenancePage({
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
  const priorityRaw = single(sp, 'priority')
  const locationRaw = single(sp, 'location')
  const assigneeRaw = single(sp, 'assignee')
  const pageRaw = single(sp, 'page')

  const filters: Filters = {
    status: VALID_STATUSES.includes(statusRaw as MaintenanceStatus)
      ? (statusRaw as MaintenanceStatus)
      : undefined,
    priority: VALID_PRIORITIES.includes(priorityRaw as MaintenancePriority)
      ? (priorityRaw as MaintenancePriority)
      : undefined,
    locationType: VALID_LOCATIONS.includes(locationRaw as MaintenanceLocation)
      ? (locationRaw as MaintenanceLocation)
      : undefined,
    assignedTo:
      assigneeRaw && assigneeRaw !== 'all' ? assigneeRaw : undefined,
    page: pageRaw ? Math.max(1, Number(pageRaw) || 1) : 1,
    pageSize: 20,
  }

  const [{ rows, total, page, pageSize }, technicians] = await Promise.all([
    listMaintenanceRequests(buildingId, filters),
    isManager ? listTechnicians(buildingId) : Promise.resolve([]),
  ])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const cleanedSearch: Record<string, string | undefined> = {
    status: typeof statusRaw === 'string' ? statusRaw : undefined,
    priority: typeof priorityRaw === 'string' ? priorityRaw : undefined,
    location: typeof locationRaw === 'string' ? locationRaw : undefined,
    assignee: typeof assigneeRaw === 'string' ? assigneeRaw : undefined,
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="طلبات الصيانة"
        description={
          isManager
            ? 'تتبّع كل الطلبات، أسندها لفنيين، وأغلِقها بإثبات الإنجاز.'
            : 'طلبات الصيانة المتعلّقة بشقتك أو تلك المُسندة لك.'
        }
        actions={
          <Button asChild size="sm">
            <Link href="/maintenance/new">
              <Plus className="h-4 w-4" />
              طلب جديد
            </Link>
          </Button>
        }
      />

      <MaintenanceFilters
        technicians={technicians}
        showAssigneeFilter={isManager}
      />

      {rows.length === 0 ? (
        <EmptyState
          title="لا توجد طلبات"
          description="جرّب تغيير الفلاتر، أو سجّل طلباً جديداً."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => (
              <RequestCard key={r.id} request={r} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                صفحة {page} من {totalPages} · {total} طلب
              </span>
              <div className="flex items-center gap-2">
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  aria-disabled={page <= 1}
                >
                  <Link href={buildHref('/maintenance', cleanedSearch, { page: page - 1 })}>
                    <ChevronRight className="h-4 w-4 lucide-chevron-right" />
                    السابق
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  aria-disabled={page >= totalPages}
                >
                  <Link href={buildHref('/maintenance', cleanedSearch, { page: page + 1 })}>
                    التالي
                    <ChevronLeft className="h-4 w-4 lucide-chevron-left" />
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
