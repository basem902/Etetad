'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
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
import { cancelExpenseAction } from '@/actions/expenses'

interface Props {
  expenseId: string
  /** When true, render a smaller variant suited for inline tables (icon only). */
  compact?: boolean
}

export function CancelDialog({ expenseId, compact }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleCancel() {
    if (!reason.trim() || reason.trim().length < 3) {
      toast.error('سبب الإلغاء مطلوب (3 أحرف على الأقل)')
      return
    }
    const fd = new FormData()
    fd.set('expense_id', expenseId)
    fd.set('cancellation_reason', reason.trim())
    startTransition(async () => {
      const result = await cancelExpenseAction(fd)
      if (result.success) {
        toast.success(result.message ?? 'تم إلغاء المصروف')
        setOpen(false)
        setReason('')
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        size={compact ? 'sm' : 'default'}
        variant="destructive"
        onClick={() => setOpen(true)}
        disabled={isPending}
      >
        <X className="h-4 w-4" />
        إلغاء المصروف
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إلغاء المصروف</DialogTitle>
          <DialogDescription>
            الإلغاء نهائي ولا يُحذف السجل. سبب الإلغاء يُسجَّل في سجل التدقيق.
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="cancellation_reason">سبب الإلغاء</Label>
          <Textarea
            id="cancellation_reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            minLength={3}
            maxLength={500}
            disabled={isPending}
            placeholder="مثلاً: تم الدفع نقداً من خارج الحساب، الإلغاء لأغراض المحاسبة."
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
            onClick={handleCancel}
            loading={isPending}
            disabled={!reason.trim() || reason.trim().length < 3}
          >
            تأكيد الإلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
