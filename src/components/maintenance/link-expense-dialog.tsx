'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Receipt } from 'lucide-react'
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
import { linkMaintenanceToExpenseAction } from '@/actions/maintenance'

interface Props {
  requestId: string
  cost: number | null
  /** When set, the request is already linked — disables the button. */
  existingExpenseId?: string | null
}

export function LinkExpenseDialog({ requestId, cost, existingExpenseId }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleLink() {
    const fd = new FormData()
    fd.set('request_id', requestId)
    startTransition(async () => {
      const result = await linkMaintenanceToExpenseAction(fd)
      if (result.success) {
        toast.success(result.message ?? 'تم إنشاء المصروف وربطه')
        setOpen(false)
        router.refresh()
        if ('data' in result && result.data?.expense_id) {
          router.push(`/expenses/${result.data.expense_id}`)
        }
      } else {
        toast.error(result.error)
      }
    })
  }

  if (existingExpenseId) {
    return (
      <Button asChild variant="outline" size="sm">
        <a href={`/expenses/${existingExpenseId}`}>
          <Receipt className="h-4 w-4" />
          عرض المصروف المرتبط
        </a>
      </Button>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={isPending}
      >
        <Receipt className="h-4 w-4" />
        إنشاء مصروف من الطلب
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إنشاء مصروف مرتبط</DialogTitle>
          <DialogDescription>
            سيُنشَأ مصروف مسودّة بعنوان «صيانة: …» ومبلغ مساوٍ لتكلفة الطلب
            {cost != null ? ` (${cost} ر.س)` : ''}. يمكنك تعديله لاحقاً في صفحة المصروفات.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isPending}>
              تراجع
            </Button>
          </DialogClose>
          <Button onClick={handleLink} loading={isPending}>
            إنشاء وربط
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
