import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId, getUserBuildings } from '@/lib/tenant'
import { hasRole, isSuperAdmin } from '@/lib/permissions'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { PageHeader } from '@/components/shared/page-header'
import {
  PaymentStatusBadge,
  PaymentMethodLabel,
} from '@/components/dashboard/status-badges'
import { ApprovalActions } from '@/components/payments/approval-actions'
import { ReceiptPreview } from '@/components/payments/receipt-preview'
import { getPayment } from '@/lib/queries/payments'
import { formatCurrency, formatDate, formatDateTime, formatMonth } from '@/lib/format'

export const metadata: Metadata = {
  title: 'تفاصيل الدفعة · نظام إدارة العمارة',
}

export default async function PaymentDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const buildings = await getUserBuildings(user.id)
  if (buildings.length === 0) redirect('/onboarding')

  const buildingId = (await getActiveBuildingId()) ?? buildings[0]?.building_id
  if (!buildingId) redirect('/onboarding')

  const payment = await getPayment(buildingId, id)
  if (!payment) notFound()

  const canApprove =
    (await isSuperAdmin(user.id)) ||
    (await hasRole(buildingId, ['admin', 'treasurer'], user.id))

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">
        <Link
          href="/payments"
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4 lucide-chevron-right" />
          العودة إلى المدفوعات
        </Link>
      </div>

      <PageHeader
        title={`دفعة شقة ${payment.apartment_number ?? '—'}`}
        description={`عن شهر ${formatMonth(payment.period_month)}`}
        actions={<PaymentStatusBadge status={payment.status} />}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              المبلغ
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {formatCurrency(Number(payment.amount))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              تاريخ الدفع
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-base font-medium">{formatDate(payment.payment_date)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              طريقة الدفع
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-base font-medium">
              <PaymentMethodLabel method={payment.method} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Approval actions (treasurer/admin, only when status=pending) */}
      {canApprove && payment.status === 'pending' && (
        <Card className="border-warning/40 bg-warning/5">
          <CardHeader>
            <CardTitle className="text-base">قرار المراجعة</CardTitle>
            <CardDescription>
              عند الاعتماد سيُحسب المبلغ في رصيد العمارة. عند الرفض يظل الإيصال
              محفوظاً مع سبب الرفض في سجل التدقيق.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ApprovalActions paymentId={payment.id} variant="block" />
          </CardContent>
        </Card>
      )}

      {/* Rejection reason (when rejected) */}
      {payment.status === 'rejected' && payment.rejection_reason && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-base">سبب الرفض</CardTitle>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">
            {payment.rejection_reason}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>إيصال الدفع</CardTitle>
        </CardHeader>
        <CardContent>
          <ReceiptPreview path={payment.receipt_url} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">معلومات إضافية</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
          <div>
            <div className="text-muted-foreground">المُسجِّل</div>
            <div>{payment.created_by_name ?? '—'}</div>
          </div>
          <div>
            <div className="text-muted-foreground">تاريخ التسجيل</div>
            <div>{formatDateTime(payment.created_at)}</div>
          </div>
          {payment.approved_by_name && (
            <>
              <div>
                <div className="text-muted-foreground">
                  {payment.status === 'approved' ? 'اعتمدها' : 'راجعها'}
                </div>
                <div>{payment.approved_by_name}</div>
              </div>
              {payment.approved_at && (
                <div>
                  <div className="text-muted-foreground">تاريخ المراجعة</div>
                  <div>{formatDateTime(payment.approved_at)}</div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {payment.notes && (
        <>
          <Separator />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">ملاحظات</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground whitespace-pre-wrap">
              {payment.notes}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
