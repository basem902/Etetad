import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Wrench,
  Vote,
  Receipt,
} from 'lucide-react'
import type { MembershipRole } from '@/types/database'
import { StatsCard } from './stats-card'
import { RecentPayments } from './recent-payments'
import { RecentExpenses } from './recent-expenses'
import { RecentMaintenance } from './recent-maintenance'
import { ActiveVotes } from './active-votes'
import { QuickActions } from './quick-actions'
import { formatCurrency, formatMonth } from '@/lib/format'
import { getBuildingDashboardSummary } from '@/lib/queries/dashboard'

interface Props {
  buildingId: string
  userId: string
  role: Extract<MembershipRole, 'admin' | 'treasurer' | 'committee'>
}

export async function AdminDashboard({ buildingId, userId, role }: Props) {
  const s = await getBuildingDashboardSummary(buildingId)
  const currentMonthLabel = formatMonth(new Date())

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          label="الرصيد الحالي"
          value={formatCurrency(s.balance)}
          icon={Wallet}
          description="مدفوعات معتمدة − مصروفات مدفوعة"
          emphasizeNegative
        />
        <StatsCard
          label={`دخل ${currentMonthLabel}`}
          value={formatCurrency(s.monthIncome)}
          icon={TrendingUp}
          description="مدفوعات معتمدة هذا الشهر"
        />
        <StatsCard
          label={`مصروفات ${currentMonthLabel}`}
          value={formatCurrency(s.monthExpense)}
          icon={TrendingDown}
          description="مصروفات مدفوعة هذا الشهر"
        />
        <StatsCard
          label="بانتظار المراجعة"
          value={s.pendingPaymentsCount}
          icon={Receipt}
          description="مدفوعات pending"
          trend={s.pendingPaymentsCount > 0 ? { label: 'تحتاج اعتماد', variant: 'warning' } : undefined}
        />
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
        <StatsCard
          label="طلبات صيانة مفتوحة"
          value={s.openMaintenanceCount}
          icon={Wrench}
          description="غير مكتملة بعد"
        />
        <StatsCard
          label="تصويتات نشطة"
          value={s.activeVotesCount}
          icon={Vote}
          description="مفتوحة للتصويت حالياً"
        />
      </div>

      <QuickActions role={role} />

      <div className="grid gap-4 lg:grid-cols-2">
        <RecentPayments buildingId={buildingId} />
        <RecentExpenses buildingId={buildingId} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RecentMaintenance buildingId={buildingId} />
        <ActiveVotes buildingId={buildingId} userId={userId} />
      </div>
    </div>
  )
}
