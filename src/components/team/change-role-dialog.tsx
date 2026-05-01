'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserCog } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { changeMemberRoleAction } from '@/actions/team'
import type { MembershipRole } from '@/types/database'

const ROLE_LABELS_AR: Record<MembershipRole, string> = {
  admin: 'مدير العمارة',
  treasurer: 'أمين الصندوق',
  committee: 'عضو اللجنة',
  resident: 'ساكن',
  technician: 'فني',
}

interface Props {
  membershipId: string
  memberName: string
  currentRole: MembershipRole
}

export function ChangeRoleDialog({
  membershipId,
  memberName,
  currentRole,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [newRole, setNewRole] = useState<MembershipRole>(currentRole)

  function onSubmit() {
    if (newRole === currentRole) {
      setOpen(false)
      return
    }
    const fd = new FormData()
    fd.set('membership_id', membershipId)
    fd.set('new_role', newRole)
    startTransition(async () => {
      const result = await changeMemberRoleAction(fd)
      if (result.success) {
        toast.success(result.message ?? 'تم تَغيير الدور')
        setOpen(false)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="تَغيير الدور">
          <UserCog className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تَغيير دَور العُضو</DialogTitle>
          <DialogDescription>
            <strong>{memberName}</strong> — الدور الحالي:{' '}
            <strong>{ROLE_LABELS_AR[currentRole]}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="new_role">الدور الجَديد</Label>
            <Select
              value={newRole}
              onValueChange={(v) => setNewRole(v as MembershipRole)}
              disabled={isPending}
            >
              <SelectTrigger id="new_role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">{ROLE_LABELS_AR.admin}</SelectItem>
                <SelectItem value="treasurer">{ROLE_LABELS_AR.treasurer}</SelectItem>
                <SelectItem value="committee">{ROLE_LABELS_AR.committee}</SelectItem>
                <SelectItem value="resident">{ROLE_LABELS_AR.resident}</SelectItem>
                <SelectItem value="technician">{ROLE_LABELS_AR.technician}</SelectItem>
              </SelectContent>
            </Select>
            {newRole === 'admin' && currentRole !== 'admin' && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                ⚠️ ستُعطي هذا العُضو صَلاحيات admin كاملة على العمارة (إضافة/حذف
                شُقَق، اعتماد طَلبات، إدارة الفريق، إلخ).
              </p>
            )}
            {currentRole === 'admin' && newRole !== 'admin' && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                ⚠️ ستُلغي صَلاحيات الإدارة عن هذا العُضو. تأكَّد من وُجود admin
                آخر — وإلا سيُرفَض التَغيير.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isPending}>
              إلغاء
            </Button>
          </DialogClose>
          <Button onClick={onSubmit} loading={isPending}>
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
