'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, XCircle, RotateCcw, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { OrderStatusBadge } from '@/components/subscriptions/order-status-badge'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format'
import {
  approveOrderAction,
  rejectOrderAction,
  resetFailedProvisioningAction,
} from '@/actions/subscriptions'
import type { Tables } from '@/types/database'

type OrderRow = Tables<'subscription_orders'>

interface Props {
  order: OrderRow
  receiptSignedUrl: string | null
}

export function OrderReviewCard({ order, receiptSignedUrl }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')

  function handleApprove() {
    return new Promise<void>((resolve) => {
      const fd = new FormData()
      fd.set('order_id', order.id)
      startTransition(async () => {
        const result = await approveOrderAction(fd)
        if (result.success) {
          toast.success(result.message ?? 'تم الاعتماد.')
          router.refresh()
        } else {
          toast.error(result.error)
        }
        resolve()
      })
    })
  }

  function handleReject() {
    if (reason.trim().length < 3) {
      toast.error('سبب الرفض مَطلوب (3 أحرف على الأقل).')
      return
    }
    const fd = new FormData()
    fd.set('order_id', order.id)
    fd.set('reason', reason.trim())
    startTransition(async () => {
      const result = await rejectOrderAction(fd)
      if (result.success) {
        toast.success(result.message ?? 'تم الرفض.')
        setRejectOpen(false)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleResetFailed() {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const result = await resetFailedProvisioningAction(order.id)
        if (result.success) {
          toast.success(result.message ?? 'تم.')
          router.refresh()
        } else {
          toast.error(result.error)
        }
        resolve()
      })
    })
  }

  // v0.23: super_admin can skip the customer's receipt-upload step and
  // approve/reject directly from awaiting_payment. The order goes straight
  // to provisioning without ever sitting in awaiting_review.
  const canApprove =
    order.status === 'awaiting_payment' || order.status === 'awaiting_review'
  const canReject =
    order.status === 'awaiting_payment' ||
    order.status === 'awaiting_review' ||
    order.status === 'provisioning_failed'
  const canRetry = order.status === 'provisioning_failed'
  const isSkipReceipt = order.status === 'awaiting_payment'

  return (
    <div className="space-y-4">
      {/* Status + actions header */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <span className="font-mono text-base">{order.reference_number}</span>
              <OrderStatusBadge status={order.status} />
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              أُنشئ {formatDateTime(order.created_at)}
              {order.reviewed_at && (
                <> · رُوجع {formatDateTime(order.reviewed_at)}</>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canRetry && (
              <ConfirmDialog
                title="إعادة الطلب لـ awaiting_review"
                description="سَتَستطيع المحاولة مرة أخرى. لاحظ: إن كنت قد أرسلت دعوة Supabase سابقاً، تَأكد من حذف المستخدم القديم من Auth أولاً."
                confirmLabel="إعادة"
                onConfirm={handleResetFailed}
                trigger={
                  <Button variant="outline" size="sm" disabled={isPending}>
                    <RotateCcw className="h-4 w-4" />
                    إعادة المحاولة
                  </Button>
                }
              />
            )}
            {canReject && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setRejectOpen(true)}
                disabled={isPending}
              >
                <XCircle className="h-4 w-4" />
                رفض
              </Button>
            )}
            {canApprove && (
              <ConfirmDialog
                title={
                  isSkipReceipt
                    ? 'اعتماد بدون إيصال + تَفعيل الاشتراك'
                    : 'اعتماد الطلب وتَفعيل الاشتراك'
                }
                description={
                  isSkipReceipt
                    ? 'لا يوجد إيصال تَحويل مَرفوع لهذا الطلب. تَأكد أن الدَفع وَصَل قَبل المُتابَعة. سَنُنشئ العمارة + نَربط حساب العَميل كـ admin مُباشَرة.'
                    : 'سَنُنشئ العمارة + نَربط حساب العَميل كـ admin. هذه عملية ذرّية — لو فَشل أي جزء، الـ order يَنتقل لـ provisioning_failed.'
                }
                confirmLabel={isSkipReceipt ? 'اعتماد بدون إيصال' : 'اعتماد'}
                onConfirm={handleApprove}
                trigger={
                  <Button size="sm" disabled={isPending}>
                    <CheckCircle2 className="h-4 w-4" />
                    {isSkipReceipt ? 'تَأكيد الدَفع + تَفعيل' : 'اعتماد + تَفعيل'}
                  </Button>
                }
              />
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Order details + receipt + customer */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">بيانات العميل</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Field label="الاسم" value={order.full_name} />
            <Field
              label="البريد"
              value={
                <a href={`mailto:${order.email}`} className="hover:underline" dir="ltr">
                  {order.email}
                </a>
              }
            />
            <Field
              label="الجوال"
              value={
                <a href={`tel:${order.phone}`} className="hover:underline" dir="ltr">
                  {order.phone}
                </a>
              }
            />
            <Field label="المدينة" value={order.city ?? '—'} />
            <Field label="اسم العمارة" value={order.building_name} />
            <Field
              label="عدد الشقق المتوقَّع"
              value={order.estimated_apartments != null ? String(order.estimated_apartments) : '—'}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">تَفاصيل الاشتراك</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Field label="الباقة" value={order.tier_id} />
            <Field label="الفترة" value={order.cycle === 'monthly' ? 'شهري' : 'سنوي'} />
            <Field label="المبلغ" value={formatCurrency(Number(order.amount))} />
            {Number(order.vat_amount) > 0 && (
              <Field
                label="ضريبة (VAT)"
                value={formatCurrency(Number(order.vat_amount))}
              />
            )}
            <Field
              label="الإجمالي"
              value={
                <span className="font-bold tabular-nums">
                  {formatCurrency(Number(order.total_amount))}
                </span>
              }
            />
            {order.transfer_date && (
              <Field
                label="تاريخ التحويل"
                value={formatDate(order.transfer_date)}
              />
            )}
            {order.transfer_reference && (
              <Field
                label="مرجع البنك"
                value={
                  <code className="font-mono text-xs">{order.transfer_reference}</code>
                }
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Receipt preview */}
      {receiptSignedUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>إيصال التحويل</span>
              <Button asChild variant="outline" size="sm">
                <a href={receiptSignedUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  فتح في تبويب جديد
                </a>
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-border overflow-hidden bg-muted/30">
              {receiptSignedUrl.endsWith('.pdf') ? (
                <iframe
                  src={receiptSignedUrl}
                  className="w-full h-[600px]"
                  title="إيصال التحويل"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={receiptSignedUrl}
                  alt="إيصال التحويل"
                  className="max-w-full mx-auto"
                  loading="lazy"
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              قارن مع كشف حسابك البنكي قبل الاعتماد. ابحث عن المبلغ + رقم المرجع
              <code className="font-mono mx-1">{order.reference_number}</code>
              في حقل البيان.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Provisioning failed details */}
      {order.status === 'provisioning_failed' && order.provisioning_failure_reason && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-base text-destructive">
              فشل التَفعيل
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap break-words">
              {order.provisioning_failure_reason}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Rejection details */}
      {order.status === 'rejected' && order.rejection_reason && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-base text-destructive">سبب الرفض</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{order.rejection_reason}</p>
            <p className="text-xs text-muted-foreground mt-2">
              عدد المحاولات: {order.rejection_attempt_count}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>رفض الطلب</DialogTitle>
            <DialogDescription>
              العميل سَيَستلم بريداً يَحوي السبب + رابط لإعادة المحاولة (إن لم
              يَتجاوز 3 محاولات).
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="reason">سبب الرفض</Label>
            <Textarea
              id="reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={3}
              maxLength={500}
              placeholder="مثلاً: المبلغ المُحوَّل لا يُطابق رقم المرجع، أو الإيصال غير واضح."
              disabled={isPending}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={isPending}>
                إلغاء
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleReject}
              loading={isPending}
              disabled={reason.trim().length < 3}
            >
              تأكيد الرفض
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[100px_1fr] items-start gap-2 py-1 border-b border-border last:border-0">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span>{value}</span>
    </div>
  )
}
