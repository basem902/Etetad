import { Badge } from '@/components/ui/badge'
import type {
  PaymentStatus,
  ExpenseStatus,
  MaintenanceStatus,
  MaintenancePriority,
  PaymentMethod,
} from '@/types/database'

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const cfg: Record<PaymentStatus, { label: string; variant: 'success' | 'warning' | 'destructive' }> =
    {
      approved: { label: 'معتمدة', variant: 'success' },
      pending: { label: 'بانتظار المراجعة', variant: 'warning' },
      rejected: { label: 'مرفوضة', variant: 'destructive' },
    }
  const c = cfg[status]
  return <Badge variant={c.variant}>{c.label}</Badge>
}

export function PaymentMethodLabel({ method }: { method: PaymentMethod }): string {
  return (
    {
      cash: 'نقد',
      bank_transfer: 'تحويل بنكي',
      online: 'تحويل أونلاين',
      cheque: 'شيك',
    } as const
  )[method]
}

export function ExpenseStatusBadge({ status }: { status: ExpenseStatus }) {
  const cfg: Record<
    ExpenseStatus,
    { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' | 'default' }
  > = {
    draft: { label: 'مسودة', variant: 'secondary' },
    pending_review: { label: 'بانتظار المراجعة', variant: 'warning' },
    approved: { label: 'معتمد', variant: 'default' },
    rejected: { label: 'مرفوض', variant: 'destructive' },
    paid: { label: 'مدفوع', variant: 'success' },
    cancelled: { label: 'ملغى', variant: 'destructive' },
  }
  const c = cfg[status]
  return <Badge variant={c.variant}>{c.label}</Badge>
}

export function MaintenanceStatusBadge({ status }: { status: MaintenanceStatus }) {
  const cfg: Record<
    MaintenanceStatus,
    { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' | 'default' }
  > = {
    new: { label: 'جديد', variant: 'default' },
    reviewing: { label: 'قيد المراجعة', variant: 'secondary' },
    waiting_quote: { label: 'بانتظار عرض', variant: 'warning' },
    waiting_approval: { label: 'بانتظار الاعتماد', variant: 'warning' },
    in_progress: { label: 'قيد التنفيذ', variant: 'warning' },
    completed: { label: 'مكتمل', variant: 'success' },
    rejected: { label: 'مرفوض', variant: 'destructive' },
    reopened: { label: 'أُعيد فتحه', variant: 'secondary' },
  }
  const c = cfg[status]
  return <Badge variant={c.variant}>{c.label}</Badge>
}

export function PriorityBadge({ priority }: { priority: MaintenancePriority }) {
  const cfg: Record<
    MaintenancePriority,
    { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' }
  > = {
    low: { label: 'منخفضة', variant: 'secondary' },
    medium: { label: 'متوسطة', variant: 'secondary' },
    high: { label: 'عالية', variant: 'warning' },
    urgent: { label: 'عاجلة', variant: 'destructive' },
  }
  const c = cfg[priority]
  return <Badge variant={c.variant}>{c.label}</Badge>
}
