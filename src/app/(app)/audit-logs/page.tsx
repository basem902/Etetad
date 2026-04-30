import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId, getUserBuildings } from '@/lib/tenant'
import { hasRole, isSuperAdmin } from '@/lib/permissions'
import { PageHeader } from '@/components/shared/page-header'
import { AuditFilters } from '@/components/audit/audit-filters'
import { AuditTable } from '@/components/audit/audit-table'
import {
  listAuditLogs,
  listAuditEntityTypes,
  listAuditActors,
} from '@/lib/queries/audit'

export const metadata: Metadata = {
  title: 'سجل النشاطات · نظام إدارة العمارة',
}

function single(
  sp: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const v = sp[key]
  return Array.isArray(v) ? v[0] : v
}

export default async function AuditLogsPage({
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

  const isAuthorized =
    (await isSuperAdmin(user.id)) ||
    (await hasRole(buildingId, ['admin', 'committee'], user.id))
  if (!isAuthorized) redirect('/forbidden')

  const sp = await searchParams
  const entityType = single(sp, 'entity')
  const action = single(sp, 'action')
  const actorId = single(sp, 'actor')
  const dateFrom = single(sp, 'from')
  const dateTo = single(sp, 'to')
  const before = single(sp, 'before')

  const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)

  const [{ rows, nextCursor, pageSize }, entityTypes, actors] = await Promise.all([
    listAuditLogs(buildingId, {
      entityType: entityType && entityType !== 'all' ? entityType : undefined,
      action: action && action !== 'all' ? action : undefined,
      actorId: actorId && actorId !== 'all' ? actorId : undefined,
      dateFrom: dateFrom && isYmd(dateFrom) ? dateFrom : undefined,
      dateTo: dateTo && isYmd(dateTo) ? dateTo : undefined,
      before: before || undefined,
      pageSize: 50,
    }),
    listAuditEntityTypes(buildingId),
    listAuditActors(buildingId),
  ])

  const cleanedSearch: Record<string, string | undefined> = {
    entity: typeof entityType === 'string' ? entityType : undefined,
    action: typeof action === 'string' ? action : undefined,
    actor: typeof actorId === 'string' ? actorId : undefined,
    from: typeof dateFrom === 'string' ? dateFrom : undefined,
    to: typeof dateTo === 'string' ? dateTo : undefined,
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="سجل النشاطات"
        description="كل التغييرات على البيانات الحساسة (مدفوعات، مصروفات، صيانة، تصويتات، …) تُسجَّل تلقائياً عبر triggers لأغراض الـ audit."
      />

      <AuditFilters entityTypes={entityTypes} actors={actors} />

      <AuditTable
        rows={rows}
        nextCursor={nextCursor}
        pageSize={pageSize}
        searchParams={cleanedSearch}
      />
    </div>
  )
}
