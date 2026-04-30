'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X } from 'lucide-react'
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
import { approvePaymentAction, rejectPaymentAction } from '@/actions/payments'

interface Props {
  paymentId: string
  variant?: 'inline' | 'block'
}

export function ApprovalActions({ paymentId, variant = 'inline' }: Props) {
  const router = useRouter()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()

  async function handleApprove() {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const result = await approvePaymentAction(paymentId)
        if (result.success) {
          toast.success(result.message ?? 'تم اعتماد الدفعة')
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
    fd.set('payment_id', paymentId)
    fd.set('rejection_reason', reason.trim())
    startTransition(async () => {
      const result = await rejectPaymentAction(fd)
      if (result.success) {
        toast.success(result.message ?? 'تم رفض الدفعة')
        setRejectOpen(false)
        setReason('')
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <div
      className={
        variant === 'block'
          ? 'flex flex-col gap-2 sm:flex-row'
          : 'flex items-center gap-2'
      }
    >
      <ConfirmDialog
        title="اعتماد الدفعة"
        description="بعد الاعتماد، سيُحسب مبلغ الدفعة في رصيد العمارة."
        confirmLabel="اعتماد"
        cancelLabel="إلغاء"
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
            <DialogTitle>رفض الدفعة</DialogTitle>
            <DialogDescription>
              يلزم سبب مكتوب يُسجَّل في سجل التدقيق ويظهر للساكن.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="rejection_reason">سبب الرفض</Label>
            <Textarea
              id="rejection_reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={3}
              maxLength={500}
              disabled={isPending}
              placeholder="مثلاً: الإيصال غير واضح، يرجى إعادة الرفع."
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
              disabled={!reason.trim() || reason.trim().length < 3}
            >
              تأكيد الرفض
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
