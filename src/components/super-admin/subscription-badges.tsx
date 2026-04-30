import { Badge } from '@/components/ui/badge'
import type {
  SubscriptionPlan,
  SubscriptionStatus,
} from '@/types/database'

// =============================================
// Subscription badges (status + plan)
// =============================================
// Shared visual mapping. Used by buildings-table, the building detail page,
// and trial-warnings. Centralized so future label/color tweaks happen in one
// place.
// =============================================

type StatusVariant = 'default' | 'success' | 'warning' | 'destructive' | 'secondary' | 'outline'

const STATUS_CONFIG: Record<
  SubscriptionStatus,
  { label: string; variant: StatusVariant }
> = {
  trial: { label: 'تجربة', variant: 'secondary' },
  active: { label: 'نشطة', variant: 'success' },
  past_due: { label: 'متأخّرة', variant: 'warning' },
  cancelled: { label: 'ملغاة', variant: 'destructive' },
  expired: { label: 'منتهية', variant: 'destructive' },
}

const PLAN_CONFIG: Record<SubscriptionPlan, { label: string }> = {
  trial: { label: 'تجربة' },
  basic: { label: 'أساسية' },
  pro: { label: 'احترافية' },
  enterprise: { label: 'مؤسسات' },
}

export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  const cfg = STATUS_CONFIG[status]
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>
}

export function SubscriptionPlanBadge({ plan }: { plan: SubscriptionPlan }) {
  const cfg = PLAN_CONFIG[plan]
  return <Badge variant="outline">{cfg.label}</Badge>
}

export const SUBSCRIPTION_STATUS_LABELS = Object.fromEntries(
  Object.entries(STATUS_CONFIG).map(([k, v]) => [k, v.label]),
) as Record<SubscriptionStatus, string>

export const SUBSCRIPTION_PLAN_LABELS = Object.fromEntries(
  Object.entries(PLAN_CONFIG).map(([k, v]) => [k, v.label]),
) as Record<SubscriptionPlan, string>
