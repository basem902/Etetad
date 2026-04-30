import type { Metadata } from 'next'
import Link from 'next/link'
import { Building2, FileText, Users, Inbox, Settings, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared/page-header'
import { PlatformStatsGrid } from '@/components/super-admin/platform-stats-grid'
import { TrialWarnings } from '@/components/super-admin/trial-warnings'
import {
  getPlatformStats,
  listAllBuildings,
} from '@/lib/queries/super-admin'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'لوحة المنصة · Super Admin',
}

// =============================================
// Super-admin dashboard (Phase 14)
// =============================================
// Layer-0 access control: middleware (rewrite to /forbidden) + super-admin
// layout (server-side recheck via isSuperAdmin). Data here flows through
// SECURITY DEFINER RPCs that themselves enforce is_super_admin() — even if
// some other code path got in here without the role, the RPC denies.
// =============================================
export default async function SuperAdminDashboardPage() {
  const supabase = await createClient()
  const [stats, allBuildings, newRequestsRes, pendingOrdersRes] = await Promise.all([
    getPlatformStats(),
    // Fetch trial buildings only — trial_warnings filters down to "<= 7 days"
    // client-side (or already-expired). All-buildings list lives on its own
    // page and is paginated.
    listAllBuildings({ status: 'trial' }),
    // Phase 16: count of new (unhandled) subscription_requests for the
    // dashboard quick action.
    supabase
      .from('subscription_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'new'),
    // Phase 18: count of orders awaiting review or stuck in provisioning_failed
    supabase
      .from('subscription_orders')
      .select('*', { count: 'exact', head: true })
      .in('status', ['awaiting_review', 'provisioning_failed']),
  ])
  const newRequestsCount = newRequestsRes.count ?? 0
  const ordersToReviewCount = pendingOrdersRes.count ?? 0

  // Filter to trials ending within 7 days OR already expired (still trial),
  // then sort by trial_ends_at ascending (most urgent first), max 10.
  const sevenDays = 7 * 24 * 60 * 60 * 1000
  const trialAlerts = allBuildings
    .filter((b) => {
      if (!b.trial_ends_at) return false
      const ends = new Date(b.trial_ends_at).getTime()
      return ends - Date.now() < sevenDays
    })
    .sort((a, b) => {
      const ta = a.trial_ends_at ? new Date(a.trial_ends_at).getTime() : Infinity
      const tb = b.trial_ends_at ? new Date(b.trial_ends_at).getTime() : Infinity
      return ta - tb
    })
    .slice(0, 10)

  return (
    <div className="space-y-6">
      <PageHeader
        title="لوحة المنصة"
        description="إدارة كل العمارات والاشتراكات على المنصة."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/super-admin/buildings">
                <Building2 className="h-4 w-4" />
                كل العمارات
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/super-admin/users">
                <Users className="h-4 w-4" />
                المستخدمون
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/super-admin/orders">
                <ShoppingCart className="h-4 w-4" />
                طلبات الاشتراك
                {ordersToReviewCount > 0 && (
                  <Badge variant="warning" className="ml-1">
                    {ordersToReviewCount}
                  </Badge>
                )}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/super-admin/requests">
                <Inbox className="h-4 w-4" />
                طلبات تواصل
                {newRequestsCount > 0 && (
                  <Badge variant="default" className="ml-1">
                    {newRequestsCount}
                  </Badge>
                )}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/super-admin/audit">
                <FileText className="h-4 w-4" />
                السجلات
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/super-admin/settings">
                <Settings className="h-4 w-4" />
                الإعدادات
              </Link>
            </Button>
          </div>
        }
      />

      <PlatformStatsGrid stats={stats} />

      <TrialWarnings rows={trialAlerts} />
    </div>
  )
}
