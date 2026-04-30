import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { OrdersTable } from '@/components/super-admin/orders-table'
import { Badge } from '@/components/ui/badge'
import type { Tables, SubscriptionOrderStatus } from '@/types/database'

export const metadata: Metadata = {
  title: 'طلبات الاشتراك · Super Admin',
}

type OrderRow = Tables<'subscription_orders'>

export default async function SuperAdminOrdersPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('subscription_orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  const rows = (data ?? []) as OrderRow[]

  const counts: Record<SubscriptionOrderStatus, number> = {
    awaiting_payment: 0,
    awaiting_review: 0,
    provisioning: 0,
    approved: 0,
    provisioning_failed: 0,
    rejected: 0,
    expired: 0,
  }
  for (const r of rows) {
    counts[r.status] = (counts[r.status] ?? 0) + 1
  }

  const needsReview = counts.awaiting_review + counts.provisioning_failed

  return (
    <div className="space-y-6">
      <PageHeader
        title="طلبات الاشتراك"
        description={
          needsReview > 0
            ? `لديك ${needsReview} طلب${needsReview === 1 ? '' : 'ات'} يَحتاج مراجعة.`
            : 'لا توجد طلبات بانتظار مراجعتك حالياً.'
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <CountChip label="بانتظار التحويل" count={counts.awaiting_payment} variant="warning" />
        <CountChip label="بانتظار المراجعة" count={counts.awaiting_review} variant="default" />
        <CountChip label="قيد التَفعيل" count={counts.provisioning} variant="secondary" />
        <CountChip label="فشل التَفعيل" count={counts.provisioning_failed} variant="destructive" />
        <CountChip label="مُعتَمَدة" count={counts.approved} variant="success" />
        <CountChip label="مَرفوضة" count={counts.rejected} variant="destructive" />
        <CountChip label="مُنتهية" count={counts.expired} variant="outline" />
      </div>

      <OrdersTable rows={rows} />
    </div>
  )
}

function CountChip({
  label,
  count,
  variant,
}: {
  label: string
  count: number
  variant: 'default' | 'secondary' | 'success' | 'destructive' | 'outline' | 'warning'
}) {
  if (count === 0) return null
  return (
    <Badge variant={variant}>
      {label}: {count}
    </Badge>
  )
}
