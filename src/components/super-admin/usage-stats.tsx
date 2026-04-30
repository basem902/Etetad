import {
  Activity,
  CheckSquare,
  CircleDollarSign,
  Clock,
  Home,
  Users,
  Vote,
  Wrench,
} from 'lucide-react'
import { StatsCard } from '@/components/dashboard/stats-card'
import { formatCurrency, formatNumber, formatRelative } from '@/lib/format'

type UsageDetail = {
  apartments_count: number
  members_count: number
  pending_payments_count: number
  approved_payments_total: number
  paid_expenses_total: number
  open_maintenance_count: number
  active_votes_count: number
  last_activity_at: string | null
}

interface Props {
  usage: UsageDetail | null
}

// =============================================
// Per-building usage stats
// =============================================
// Powered by the building_usage_detail RPC. We surface load metrics
// (apartments, members, open requests) and financial totals so super_admin
// can sanity-check whether a building is actually using the platform before
// extending its trial / changing its plan.
// =============================================
export function UsageStats({ usage }: Props) {
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      <StatsCard
        label="الشقق"
        value={usage ? formatNumber(usage.apartments_count) : null}
        icon={Home}
      />
      <StatsCard
        label="الأعضاء النشطون"
        value={usage ? formatNumber(usage.members_count) : null}
        icon={Users}
      />
      <StatsCard
        label="مدفوعات بانتظار الاعتماد"
        value={usage ? formatNumber(usage.pending_payments_count) : null}
        icon={Clock}
        trend={
          usage && usage.pending_payments_count > 0
            ? { label: 'تحتاج إجراء من المسؤول', variant: 'warning' }
            : undefined
        }
      />
      <StatsCard
        label="صيانة مفتوحة"
        value={usage ? formatNumber(usage.open_maintenance_count) : null}
        icon={Wrench}
      />

      <StatsCard
        label="إجمالي المدفوعات المعتمدة"
        value={usage ? formatCurrency(usage.approved_payments_total) : null}
        icon={CircleDollarSign}
      />
      <StatsCard
        label="إجمالي المصروفات المدفوعة"
        value={usage ? formatCurrency(usage.paid_expenses_total) : null}
        icon={CheckSquare}
      />
      <StatsCard
        label="تصويتات نشطة"
        value={usage ? formatNumber(usage.active_votes_count) : null}
        icon={Vote}
      />
      <StatsCard
        label="آخر نشاط"
        value={
          usage?.last_activity_at
            ? formatRelative(usage.last_activity_at)
            : usage
              ? 'لا نشاط'
              : null
        }
        icon={Activity}
      />
    </div>
  )
}
