'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { assignTechnicianAction } from '@/actions/maintenance'

interface Props {
  requestId: string
  technicians: { user_id: string; full_name: string | null }[]
  defaultCost?: number | null
}

export function AssignTechnician({ requestId, technicians, defaultCost }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [techId, setTechId] = useState<string>(technicians[0]?.user_id ?? '')
  const [cost, setCost] = useState<string>(
    defaultCost != null ? String(defaultCost) : '',
  )
  const [isPending, startTransition] = useTransition()

  function handleAssign() {
    if (!techId) {
      toast.error('اختر فنياً')
      return
    }
    const fd = new FormData()
    fd.set('request_id', requestId)
    fd.set('technician_id', techId)
    if (cost) fd.set('cost', cost)
    startTransition(async () => {
      const result = await assignTechnicianAction(fd)
      if (result.success) {
        toast.success(result.message ?? 'تم إسناد الفني')
        setOpen(false)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  if (technicians.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        لا يوجد فنيون مرتبطون بالعمارة. أضف فنياً بدور technician من إدارة الأعضاء أولاً.
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)} disabled={isPending}>
        <UserPlus className="h-4 w-4" />
        إسناد لفني
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إسناد الطلب لفني</DialogTitle>
          <DialogDescription>
            اختر الفني وأدخل التكلفة المتوقَّعة (إن وُجد عرض سعر).
            بعد الإسناد، الطلب ينتقل لحالة «بانتظار الاعتماد».
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="technician_id">الفني</Label>
            <Select value={techId} onValueChange={setTechId} disabled={isPending}>
              <SelectTrigger id="technician_id">
                <SelectValue placeholder="اختر الفني" />
              </SelectTrigger>
              <SelectContent>
                {technicians.map((t) => (
                  <SelectItem key={t.user_id} value={t.user_id}>
                    {t.full_name ?? '— بدون اسم —'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="cost">التكلفة المتوقَّعة (ر.س — اختياري)</Label>
            <Input
              id="cost"
              type="number"
              min="0"
              step="0.01"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              disabled={isPending}
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isPending}>
              تراجع
            </Button>
          </DialogClose>
          <Button onClick={handleAssign} loading={isPending} disabled={!techId}>
            تأكيد الإسناد
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
