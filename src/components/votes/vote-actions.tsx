'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Play, X, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import {
  activateVoteAction,
  closeVoteAction,
  cancelVoteAction,
} from '@/actions/governance'
import type { VoteStatus } from '@/types/database'

interface Props {
  voteId: string
  status: VoteStatus
}

export function VoteActions({ voteId, status }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function run(
    fn: (id: string) => Promise<{ success: boolean; error?: string; message?: string }>,
  ): Promise<void> {
    return new Promise((resolve) => {
      startTransition(async () => {
        const r = await fn(voteId)
        if (r.success) {
          toast.success(r.message ?? 'تم')
          router.refresh()
        } else {
          toast.error(r.error ?? 'تعذّر تنفيذ العملية')
        }
        resolve()
      })
    })
  }

  if (status === 'closed' || status === 'cancelled') return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === 'draft' && (
        <ConfirmDialog
          title="تفعيل التصويت"
          description="بعد التفعيل لا يمكن تعديل البيانات أو الخيارات. التصويت يبدأ الآن وينتهي في تاريخ ends_at."
          confirmLabel="تفعيل"
          cancelLabel="تراجع"
          onConfirm={() => run(activateVoteAction)}
          trigger={
            <Button size="sm" disabled={isPending}>
              <Play className="h-4 w-4" />
              تفعيل
            </Button>
          }
        />
      )}

      {status === 'active' && (
        <ConfirmDialog
          title="إغلاق التصويت"
          description="بعد الإغلاق ستظهر النتائج لكل السكان. لا يمكن إعادة فتحه."
          confirmLabel="إغلاق"
          cancelLabel="تراجع"
          onConfirm={() => run(closeVoteAction)}
          trigger={
            <Button size="sm" disabled={isPending}>
              <Lock className="h-4 w-4" />
              إغلاق
            </Button>
          }
        />
      )}

      <ConfirmDialog
        title="إلغاء التصويت"
        description="الإلغاء نهائي. الأصوات المُسجَّلة (إن وُجدت) تبقى محفوظة في السجل لكن التصويت لا يُحسب."
        confirmLabel="إلغاء التصويت"
        cancelLabel="تراجع"
        onConfirm={() => run(cancelVoteAction)}
        trigger={
          <Button size="sm" variant="destructive" disabled={isPending}>
            <X className="h-4 w-4" />
            إلغاء
          </Button>
        }
      />
    </div>
  )
}
