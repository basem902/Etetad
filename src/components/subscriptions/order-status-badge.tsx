import { Badge } from '@/components/ui/badge'
import type { SubscriptionOrderStatus } from '@/types/database'

const labels: Record<SubscriptionOrderStatus, string> = {
  awaiting_payment: 'بانتظار التحويل',
  awaiting_review: 'بانتظار المراجعة',
  provisioning: 'قيد التَفعيل',
  approved: 'مُعتَمَد',
  provisioning_failed: 'فشل التَفعيل',
  rejected: 'مَرفوض',
  expired: 'مُنتهي',
}

const variants: Record<
  SubscriptionOrderStatus,
  'default' | 'secondary' | 'success' | 'destructive' | 'outline' | 'warning'
> = {
  awaiting_payment: 'warning',
  awaiting_review: 'default',
  provisioning: 'secondary',
  approved: 'success',
  provisioning_failed: 'destructive',
  rejected: 'destructive',
  expired: 'outline',
}

export function OrderStatusBadge({ status }: { status: SubscriptionOrderStatus }) {
  return <Badge variant={variants[status]}>{labels[status]}</Badge>
}
