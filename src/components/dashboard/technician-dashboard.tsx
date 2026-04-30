import { Wrench } from 'lucide-react'
import { StatsCard } from './stats-card'
import { RecentMaintenance } from './recent-maintenance'
import { getTechnicianAssigned } from '@/lib/queries/dashboard'

export async function TechnicianDashboard({
  buildingId,
  userId,
}: {
  buildingId: string
  userId: string
}) {
  const items = await getTechnicianAssigned(buildingId, userId, 20)
  const openCount = items.length

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
        <StatsCard
          label="طلبات الصيانة المسندة لي"
          value={openCount}
          icon={Wrench}
          description="مفتوحة وتحتاج تنفيذ"
        />
      </div>

      {/* RecentMaintenance returns its own Card; no outer wrapper to avoid card-in-card. */}
      <RecentMaintenance
        buildingId={buildingId}
        assignedTo={userId}
        onlyOpen
        title="طلباتي المفتوحة"
        items={items}
      />
    </div>
  )
}
