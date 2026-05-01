import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus, UserCheck, FileUp, UsersRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId, getUserBuildings } from '@/lib/tenant'
import { isSuperAdmin, hasRole } from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared/page-header'
import { ApartmentsFilters } from '@/components/apartments/apartments-filters'
import { ApartmentsTable } from '@/components/apartments/apartments-table'
import { ShareJoinLink } from '@/components/apartments/share-join-link'
import { BuildingSettingsDialog } from '@/components/building/building-settings-dialog'
import { listApartments, type ApartmentsFilters as Filters } from '@/lib/queries/apartments'
import type { ApartmentStatus } from '@/types/database'

export const metadata: Metadata = {
  title: 'إدارة الشقق · نظام إدارة العمارة',
}

const VALID_STATUSES = ['occupied', 'vacant', 'under_maintenance'] as const
function parseStatus(v?: string): ApartmentStatus | undefined {
  return VALID_STATUSES.includes(v as ApartmentStatus) ? (v as ApartmentStatus) : undefined
}

export default async function ApartmentsPage({
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

  // Admin-only (or super_admin).
  const allowed =
    (await isSuperAdmin(user.id)) || (await hasRole(buildingId, ['admin'], user.id))
  if (!allowed) redirect('/forbidden')

  const sp = await searchParams
  const single = (k: string) => {
    const v = sp[k]
    return Array.isArray(v) ? v[0] : v
  }

  const filters: Filters = {
    status: parseStatus(single('status')),
    floor:
      single('floor') !== undefined && single('floor') !== ''
        ? Number(single('floor'))
        : undefined,
    occupancy:
      single('occupancy') === 'with' || single('occupancy') === 'without'
        ? (single('occupancy') as 'with' | 'without')
        : undefined,
  }
  if (typeof filters.floor === 'number' && Number.isNaN(filters.floor)) {
    filters.floor = undefined
  }

  const [rows, pendingCountRes, buildingRow] = await Promise.all([
    listApartments(buildingId, filters),
    // Phase 17: count pending join requests for the badge in header
    supabase
      .from('pending_apartment_members')
      .select('*', { count: 'exact', head: true })
      .eq('building_id', buildingId)
      .eq('status', 'pending'),
    // Phase 22: building metadata for the settings dialog
    supabase
      .from('buildings')
      .select('name, address, city, total_apartments, elevators_count, default_monthly_fee')
      .eq('id', buildingId)
      .single(),
  ])
  const pendingCount = pendingCountRes.count ?? 0
  const building = buildingRow.data

  return (
    <div className="space-y-6">
      <PageHeader
        title="إدارة الشقق"
        description="إضافة، تعديل، وربط السكان."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/apartments/pending">
                <UserCheck className="h-4 w-4" />
                طلبات الانضمام
                {pendingCount > 0 && (
                  <Badge variant="warning" className="ml-1">
                    {pendingCount}
                  </Badge>
                )}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/apartments/import">
                <FileUp className="h-4 w-4" />
                استيراد من ملف
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/apartments/members-import">
                <UsersRound className="h-4 w-4" />
                استيراد سكان
              </Link>
            </Button>
            <ShareJoinLink buildingId={buildingId} />
            {building && (
              <BuildingSettingsDialog
                initialName={building.name}
                initialAddress={building.address}
                initialCity={building.city}
                initialTotalApartments={building.total_apartments}
                initialElevatorsCount={building.elevators_count}
                initialDefaultMonthlyFee={building.default_monthly_fee}
              />
            )}
            <Button asChild size="sm">
              <Link href="/apartments/new">
                <Plus className="h-4 w-4" />
                إضافة شقة
              </Link>
            </Button>
          </div>
        }
      />

      <ApartmentsFilters />
      <ApartmentsTable rows={rows} />
    </div>
  )
}
