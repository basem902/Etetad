import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId, getUserBuildings } from '@/lib/tenant'
import { hasRole, isSuperAdmin } from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/shared/page-header'
import { VendorsGrid } from '@/components/vendors/vendors-grid'
import {
  listVendors,
  listVendorSpecialties,
} from '@/lib/queries/vendors'

export const metadata: Metadata = {
  title: 'الموردين · نظام إدارة العمارة',
}

function single(
  sp: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const v = sp[key]
  return Array.isArray(v) ? v[0] : v
}

export default async function VendorsPage({
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
    (await hasRole(buildingId, ['admin', 'treasurer', 'committee'], user.id))

  const sp = await searchParams
  const specialty = single(sp, 'specialty')
  const includeInactive = single(sp, 'inactive') === '1'

  const [vendors, specialties] = await Promise.all([
    listVendors(buildingId, {
      specialty: specialty ?? undefined,
      includeInactive,
    }),
    listVendorSpecialties(buildingId),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="الموردين والفنيين"
        description={
          canManage
            ? 'إدارة قاعدة بيانات الموردين، تقييمهم، والاتصال بهم سريعاً.'
            : 'قائمة موردين العمارة (للقراءة فقط).'
        }
        actions={
          canManage && (
            <Button asChild size="sm">
              <Link href="/vendors/new">
                <Plus className="h-4 w-4" />
                مورد جديد
              </Link>
            </Button>
          )
        }
      />

      <VendorsGrid vendors={vendors} specialties={specialties} />
    </div>
  )
}
