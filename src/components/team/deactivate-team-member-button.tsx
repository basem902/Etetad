'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserMinus } from 'lucide-react'
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
  DialogTrigger,
} from '@/components/ui/dialog'
import { deactivateTeamMemberAction } from '@/actions/team'

interface Props {
  membershipId: string
  memberName: string
  memberEmail: string
}

export function DeactivateTeamMemberButton({
  membershipId,
  memberName,
  memberEmail,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onConfirm() {
    const formData = new FormData()
    formData.set('membership_id', membershipId)
    startTransition(async () => {
      const result = await deactivateTeamMemberAction(formData)
      if (result.success) {
        toast.success(result.message ?? 'تم')
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="إزالة من الفريق">
          <UserMinus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إزالة من الفريق</DialogTitle>
          <DialogDescription>
            سيُلغى وصول <strong>{memberName}</strong> ({memberEmail}) إلى لوحة
            هذه العمارة. لا تتأثر بياناته الشخصية أو حساباته الأخرى.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isPending}>
              تراجع
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={onConfirm}
            loading={isPending}
          >
            إزالة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
