import type { Metadata } from 'next'
import { PageHeader } from '@/components/shared/page-header'
import { BuildingsFilters } from '@/components/super-admin/buildings-filters'
import { BuildingsTable } from '@/components/super-admin/buildings-table'
import { listAllBuildings } from '@/lib/queries/super-admin'
import type {
  SubscriptionPlan,
  SubscriptionStatus,
} from '@/types/database'

export const metadata: Metadata = {
  title: 'كل العمارات · Super Admin',
}

const VALID_STATUSES: SubscriptionStatus[] = [
  'trial', 'active', 'past_due', 'cancelled', 'expired',
]
const VALID_PLANS: SubscriptionPlan[] = [
  'trial', 'basic', 'pro', 'enterprise',
]

function single(
  sp: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const v = sp[key]
  return Array.isArray(v) ? v[0] : v
}

export default async function SuperAdminBuildingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const rawStatus = single(sp, 'status')
  const rawPlan = single(sp, 'plan')
  const q = single(sp, 'q')

  const status =
    rawStatus && (VALID_STATUSES as string[]).includes(rawStatus)
      ? (rawStatus as SubscriptionStatus)
      : undefined
  const plan =
    rawPlan && (VALID_PLANS as string[]).includes(rawPlan)
      ? (rawPlan as SubscriptionPlan)
      : undefined

  const rows = await listAllBuildings({ status, plan, q })

  return (
    <div className="space-y-6">
      <PageHeader
        title="كل العمارات"
        description={`إجمالي ${rows.length} عمارة بالفلاتر الحالية.`}
      />

      <BuildingsFilters />

      <BuildingsTable rows={rows} />
    </div>
  )
}
