'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Send, Check, X, CreditCard, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
import { ReceiptUploader } from '@/components/payments/receipt-uploader'
import {
  submitExpenseAction,
  approveExpenseAction,
  rejectExpenseAction,
  reopenRejectedExpenseAction,
  markExpensePaidAction,
} from '@/actions/expenses'
import type { ExpenseStatus } from '@/types/database'

interface Props {
  expenseId: string
  status: ExpenseStatus
  variant?: 'inline' | 'block'
}

/**
 * Workflow buttons. Visible buttons depend on the current status:
 *   draft           → "إرسال للمراجعة"
 *   pending_review  → "اعتماد" + "رفض"
 *   approved        → "تسجيل الدفع" (with mandatory receipt)
 *   rejected        → "إعادة فتح كمسودّة" (so creator can fix & resubmit)
 *   paid/cancelled  → none rendered (terminal)
 *
 * Cancel is intentionally NOT here — it lives in CancelDialog so the same
 * cancel button can appear next to status-actions OR alone in a row dropdown.
 */
export function StatusActions({ expenseId, status, variant = 'inline' }: Props) {
  const router = useRouter()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [paidOpen, setPaidOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()

  const wrap =
    variant === 'block'
      ? 'flex flex-col gap-2 sm:flex-row sm:items-center'
      : 'flex items-center gap-2'

  // Terminal states — nothing to do.
  if (status === 'paid' || status === 'cancelled') {
    return null
  }

  function handleSubmit() {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const result = await submitExpenseAction(expenseId)
        if (result.success) {
          toast.success(result.message ?? 'تم الإرسال للمراجعة')
          router.refresh()
        } else {
          toast.error(result.error)
        }
        resolve()
      })
    })
  }

  function handleReopen() {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const result = await reopenRejectedExpenseAction(expenseId)
        if (result.success) {
          toast.success(result.message ?? 'تم إعادة فتحه كمسودّة')
          router.refresh()
        } else {
          toast.error(result.error)
        }
        resolve()
      })
    })
  }

  function handleApprove() {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const result = await approveExpenseAction(expenseId)
        if (result.success) {
          toast.success(result.message ?? 'تم الاعتماد')
          router.refresh()
        } else {
          toast.error(result.error)
        }
        resolve()
      })
    })
  }

  function handleReject() {
    if (!reason.trim() || reason.trim().length < 3) {
      toast.error('سبب الرفض مطلوب (3 أحرف على الأقل)')
      return
    }
    const fd = new FormData()
    fd.set('expense_id', expenseId)
    fd.set('reason', reason.trim())
    startTransition(async () => {
      const result = await rejectExpenseAction(fd)
      if (result.success) {
        toast.success(result.message ?? 'تم رفض المصروف')
        setRejectOpen(false)
        setReason('')
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleMarkPaid(formData: FormData) {
    formData.set('expense_id', expenseId)
    startTransition(async () => {
      const result = await markExpensePaidAction(formData)
      if (result.success) {
        toast.success(result.message ?? 'تم تسجيل الدفع')
        setPaidOpen(false)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <div className={wrap}>
      {status === 'draft' && (
        <ConfirmDialog
          title="إرسال للمراجعة"
          description="بعد الإرسال لا يمكن تعديل البيانات حتى يُرفض أو يُلغى."
          confirmLabel="إرسال"
          cancelLabel="تراجع"
          onConfirm={handleSubmit}
          trigger={
            <Button size="sm" disabled={isPending}>
              <Send className="h-4 w-4" />
              إرسال للمراجعة
            </Button>
          }
        />
      )}

      {status === 'rejected' && (
        <ConfirmDialog
          title="إعادة فتح كمسودّة"
          description="سيعود المصروف لحالة المسودّة لتعديل البيانات وإعادة إرساله. ملاحظة المراجِع تبقى محفوظة في الوصف."
          confirmLabel="إعادة فتح"
          cancelLabel="تراجع"
          onConfirm={handleReopen}
          trigger={
            <Button size="sm" variant="outline" disabled={isPending}>
              <RotateCcw className="h-4 w-4" />
              إعادة فتح كمسودّة
            </Button>
          }
        />
      )}

      {status === 'pending_review' && (
        <>
          <ConfirmDialog
            title="اعتماد المصروف"
            description="سيُحسب المصروف في تقارير العمارة بعد تسجيل الدفع."
            confirmLabel="اعتماد"
            cancelLabel="تراجع"
            onConfirm={handleApprove}
            trigger={
              <Button size="sm" variant="default" disabled={isPending}>
                <Check className="h-4 w-4" />
                اعتماد
              </Button>
            }
          />

          <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setRejectOpen(true)}
              disabled={isPending}
            >
              <X className="h-4 w-4" />
              رفض
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>رفض المصروف</DialogTitle>
                <DialogDescription>
                  السبب يُلحق بوصف المصروف ويظهر للمنشئ ليصلح ويُعيد المحاولة.
                </DialogDescription>
              </DialogHeader>
              <div>
                <Label htmlFor="reject_reason">سبب الرفض</Label>
                <Textarea
                  id="reject_reason"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  minLength={3}
                  maxLength={500}
                  disabled={isPending}
                  placeholder="مثلاً: المبلغ لا يطابق الفاتورة المرفقة."
                />
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline" disabled={isPending}>
                    تراجع
                  </Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  onClick={handleReject}
                  loading={isPending}
                  disabled={!reason.trim() || reason.trim().length < 3}
                >
                  تأكيد الرفض
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {status === 'approved' && (
        <Dialog open={paidOpen} onOpenChange={setPaidOpen}>
          <Button
            size="sm"
            variant="default"
            onClick={() => setPaidOpen(true)}
            disabled={isPending}
          >
            <CreditCard className="h-4 w-4" />
            تسجيل الدفع
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>تسجيل الدفع</DialogTitle>
              <DialogDescription>
                ارفع إيصال التحويل/الدفع. لا يمكن وضع الحالة على «مدفوع» دون إيصال.
              </DialogDescription>
            </DialogHeader>
            <form action={handleMarkPaid} className="space-y-3">
              <div>
                <Label htmlFor="paid_receipt">إيصال الدفع (إلزامي)</Label>
                <ReceiptUploader name="receipt" required disabled={isPending} />
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={isPending}>
                    تراجع
                  </Button>
                </DialogClose>
                <Button type="submit" loading={isPending}>
                  تأكيد الدفع
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
