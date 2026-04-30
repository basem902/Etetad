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
import { addTeamMemberAction } from '@/actions/team'
import { ROLE_LABELS_AR, type TeamRole } from '@/lib/validations/team'

export function AddTeamMemberDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [role, setRole] = useState<TeamRole>('treasurer')

  function onSubmit(formData: FormData) {
    formData.set('role', role)
    startTransition(async () => {
      const result = await addTeamMemberAction(formData)
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
          إضافة عضو فريق
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إضافة عضو فريق</DialogTitle>
          <DialogDescription>
            للأدوار غير المرتبطة بشقة (أمين الصندوق، اللجنة، الفنيون). إن لم
            يكن البريد مسجَّلاً سيُرسَل دعوة للتسجيل.
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
              autoComplete="email"
            />
          </div>

          <div>
            <Label htmlFor="full_name">
              الاسم (اختياري — للدعوة الجديدة)
            </Label>
            <Input
              id="full_name"
              name="full_name"
              disabled={isPending}
              placeholder="مثلاً: محمد المحاسب"
            />
          </div>

          <div>
            <Label htmlFor="role">الدور</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as TeamRole)}
              disabled={isPending}
            >
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="treasurer">
                  {ROLE_LABELS_AR.treasurer}
                </SelectItem>
                <SelectItem value="committee">
                  {ROLE_LABELS_AR.committee}
                </SelectItem>
                <SelectItem value="technician">
                  {ROLE_LABELS_AR.technician}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              المدير (admin) والساكن (resident) لهما مسارات مختلفة.
            </p>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                إلغاء
              </Button>
            </DialogClose>
            <Button type="submit" loading={isPending}>
              إضافة / دعوة
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
