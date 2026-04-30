import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  CircleSlash,
  Home,
  Receipt,
  Users,
  XCircle,
} from 'lucide-react'
import { StatsCard } from '@/components/dashboard/stats-card'
import { formatCurrency, formatNumber } from '@/lib/format'
import type { PlatformStats } from '@/lib/queries/super-admin'

interface Props {
  stats: PlatformStats | null
}

// =============================================
// Platform stats grid (super-admin dashboard)
// =============================================
// Uses the shared StatsCard component so super-admin and per-building
// dashboards share the same visual rhythm. `null` falls back to the
// StatsCard '—' placeholder (RPC failed or super_admin check denied).
// =============================================
export function PlatformStatsGrid({ stats }: Props) {
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      <StatsCard
        label="إجمالي العمارات"
        value={stats ? formatNumber(stats.total_buildings) : null}
        icon={Building2}
        description={
          stats
            ? `${formatNumber(stats.active_buildings)} نشطة · ${formatNumber(stats.trial_buildings)} تجربة`
            : undefined
        }
      />
      <StatsCard
        label="نشطة"
        value={stats ? formatNumber(stats.active_buildings) : null}
        icon={CheckCircle2}
        trend={
          stats && stats.total_buildings > 0
            ? {
                label: `${Math.round((stats.active_buildings / stats.total_buildings) * 100)}%`,
                variant: 'success',
              }
            : undefined
        }
      />
      <StatsCard
        label="في التجربة"
        value={stats ? formatNumber(stats.trial_buildings) : null}
        icon={Activity}
        trend={
          stats && stats.trials_expiring_soon > 0
            ? {
                label: `${formatNumber(stats.trials_expiring_soon)} قريبة الانتهاء`,
                variant: 'warning',
              }
            : undefined
        }
      />
      <StatsCard
        label="منتهية"
        value={stats ? formatNumber(stats.expired_buildings) : null}
        icon={XCircle}
        trend={
          stats && stats.expired_buildings > 0
            ? { label: 'تحتاج مراجعة', variant: 'destructive' }
            : undefined
        }
      />

      <StatsCard
        label="ملغاة"
        value={stats ? formatNumber(stats.cancelled_buildings) : null}
        icon={CircleSlash}
      />
      <StatsCard
        label="إجمالي المستخدمين"
        value={stats ? formatNumber(stats.total_users) : null}
        icon={Users}
      />
      <StatsCard
        label="إجمالي الشقق"
        value={stats ? formatNumber(stats.total_apartments) : null}
        icon={Home}
      />
      <StatsCard
        label="إجمالي المدفوعات المعتمدة"
        value={stats ? formatCurrency(stats.total_payments_approved) : null}
        icon={Receipt}
      />

      {stats && stats.trials_expiring_soon > 0 && (
        <div className="sm:col-span-2 lg:col-span-4">
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              {formatNumber(stats.trials_expiring_soon)} عمارة تنتهي تجربتها خلال 7 أيام
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              ابدأ مع المسؤولين في تجديد الاشتراك قبل الانتهاء.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
