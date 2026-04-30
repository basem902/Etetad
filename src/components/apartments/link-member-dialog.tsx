'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { linkOrInviteMemberAction } from '@/actions/apartments'
import type { ApartmentRelation } from '@/types/database'

interface Props {
  apartmentId: string
}

export function LinkMemberDialog({ apartmentId }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [relation, setRelation] = useState<ApartmentRelation>('resident')

  function onSubmit(formData: FormData) {
    formData.set('apartment_id', apartmentId)
    formData.set('relation_type', relation)
    startTransition(async () => {
      const result = await linkOrInviteMemberAction(formData)
      if (result.success) {
        toast.success(result.message ?? 'تم')
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
        <Button size="sm">
          <UserPlus className="h-4 w-4" />
          إضافة عضو
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ربط عضو بالشقة</DialogTitle>
          <DialogDescription>
            أدخل بريداً مسجَّلاً لربطه مباشرة، أو بريداً جديداً ليُرسل دعوة.
          </DialogDescription>
        </DialogHeader>

        <form action={onSubmit} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="email">البريد الإلكتروني</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              dir="ltr"
              disabled={isPending}
            />
          </div>

          <div>
            <Label htmlFor="full_name">الاسم (اختياري — للدعوة الجديدة)</Label>
            <Input
              id="full_name"
              name="full_name"
              disabled={isPending}
              placeholder="مثلاً: عبدالله الساكن"
            />
          </div>

          <div>
            <Label htmlFor="relation_type">العلاقة</Label>
            <Select
              value={relation}
              onValueChange={(v) => setRelation(v as ApartmentRelation)}
              disabled={isPending}
            >
              <SelectTrigger id="relation_type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="owner">مالك</SelectItem>
                <SelectItem value="resident">مستأجر</SelectItem>
                <SelectItem value="representative">ممثل مفوّض</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                إلغاء
              </Button>
            </DialogClose>
            <Button type="submit" loading={isPending}>
              ربط / دعوة
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
