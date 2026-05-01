'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Settings } from 'lucide-react'
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
import { updateBuildingMetadataAction } from '@/actions/building'

interface Props {
  initialName: string
  initialAddress: string | null
  initialCity: string | null
  initialTotalApartments: number
  initialElevatorsCount: number
  /** Kept for the RPC contract but NOT shown in the UI — admin doesn't
   *  manage building-level fees during setup (per operator decision).
   *  Existing value is preserved unchanged. */
  initialDefaultMonthlyFee: number
}

export function BuildingSettingsDialog({
  initialName,
  initialAddress,
  initialCity,
  initialTotalApartments,
  initialElevatorsCount,
  initialDefaultMonthlyFee,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateBuildingMetadataAction(formData)
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
          <Settings className="h-4 w-4" />
          إعدادات العمارة
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>بيانات العمارة</DialogTitle>
          <DialogDescription>
            عَدَد الشُقَق + المَصاعد + الاسم + العنوان.
          </DialogDescription>
        </DialogHeader>

        <form action={onSubmit} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="name">
              اسم العمارة <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              name="name"
              required
              minLength={2}
              maxLength={200}
              defaultValue={initialName}
              disabled={isPending}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="total_apartments">
                عَدَد الشُقَق <span className="text-destructive">*</span>
              </Label>
              <Input
                id="total_apartments"
                name="total_apartments"
                type="number"
                min={0}
                max={10000}
                defaultValue={initialTotalApartments}
                disabled={isPending}
              />
            </div>
            <div>
              <Label htmlFor="elevators_count">
                عَدَد المَصاعد <span className="text-destructive">*</span>
              </Label>
              <Input
                id="elevators_count"
                name="elevators_count"
                type="number"
                min={0}
                max={100}
                defaultValue={initialElevatorsCount}
                disabled={isPending}
              />
            </div>
          </div>

          {/* Hidden — preserves existing default_monthly_fee value at the RPC
              layer. The operator chose not to surface fee management at
              building setup; admin can edit per-apartment fee later if billing
              is needed. */}
          <input
            type="hidden"
            name="default_monthly_fee"
            value={initialDefaultMonthlyFee}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="city">المدينة</Label>
              <Input
                id="city"
                name="city"
                maxLength={80}
                defaultValue={initialCity ?? ''}
                disabled={isPending}
                placeholder="الرياض"
              />
            </div>
            <div>
              <Label htmlFor="address">العنوان</Label>
              <Input
                id="address"
                name="address"
                maxLength={500}
                defaultValue={initialAddress ?? ''}
                disabled={isPending}
                placeholder="حي الواحة، شارع 5"
              />
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                إلغاء
              </Button>
            </DialogClose>
            <Button type="submit" loading={isPending}>
              حفظ
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
