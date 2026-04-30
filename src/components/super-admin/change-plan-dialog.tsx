'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUpRight } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
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
import { changePlanAction } from '@/actions/super-admin'

interface Props {
  buildingId: string
  buildingName: string
  currentTier: string
}

const TIER_NAMES: Record<string, string> = {
  basic: 'أساسية',
  pro: 'احترافية',
  enterprise: 'مؤسسات',
}

export function ChangePlanDialog({
  buildingId,
  buildingName,
  currentTier,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [newTier, setNewTier] = useState<string>(
    currentTier === 'trial' ? 'basic' : currentTier,
  )
  const [extendCycle, setExtendCycle] = useState<string>('')

  function onSubmit(formData: FormData) {
    formData.set('building_id', buildingId)
    formData.set('new_tier_id', newTier)
    formData.set('extend_cycle', extendCycle)
    startTransition(async () => {
      const result = await changePlanAction(formData)
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
        <Button variant="outline" size="sm">
          <ArrowUpRight className="h-4 w-4" />
          تغيير الباقة
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تغيير باقة العمارة</DialogTitle>
          <DialogDescription>
            override يدوي لـ <strong>{buildingName}</strong>. للترقية/التَخفيض
            عبر دفع العميل، استخدم رابط /subscribe?renew=true الذي يَملك العميل
            وصولاً إليه.
          </DialogDescription>
        </DialogHeader>

        <form action={onSubmit} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="new_tier_id">الباقة الجديدة</Label>
            <Select value={newTier} onValueChange={setNewTier} disabled={isPending}>
              <SelectTrigger id="new_tier_id">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="basic">{TIER_NAMES.basic}</SelectItem>
                <SelectItem value="pro">{TIER_NAMES.pro}</SelectItem>
                <SelectItem value="enterprise">
                  {TIER_NAMES.enterprise}
                </SelectItem>
              </SelectContent>
            </Select>
            {currentTier && (
              <p className="mt-1 text-xs text-muted-foreground">
                الحالية: {TIER_NAMES[currentTier] ?? currentTier}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="extend_cycle">تَمديد الاشتراك (اختياري)</Label>
            <Select
              value={extendCycle}
              onValueChange={setExtendCycle}
              disabled={isPending}
            >
              <SelectTrigger id="extend_cycle">
                <SelectValue placeholder="بدون تَمديد" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">بدون تَمديد (تَغيير الباقة فقط)</SelectItem>
                <SelectItem value="monthly">+ شهر واحد</SelectItem>
                <SelectItem value="yearly">+ سنة واحدة</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="note">سبب التَغيير (للسجل)</Label>
            <Input
              id="note"
              name="note"
              required
              minLength={5}
              maxLength={1000}
              placeholder="مثلاً: ترقية بعد دفع تَكميلي بنكي بـ 1000 SAR"
              disabled={isPending}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              يُسجَّل في audit_logs لعمليات الـ super-admin.
            </p>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                إلغاء
              </Button>
            </DialogClose>
            <Button type="submit" loading={isPending}>
              تطبيق
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
