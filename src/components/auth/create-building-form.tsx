'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createBuildingAction } from '@/actions/auth'

/**
 * Building-only creation form (used by /onboarding).
 * For the combined signup+building flow, see RegisterForm.
 */
export function CreateBuildingForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await createBuildingAction(formData)
      if (result.success) {
        toast.success(result.message ?? 'تم إنشاء العمارة')
        router.replace(result.redirectTo ?? '/dashboard')
        router.refresh()
      } else {
        setError(result.error)
        toast.error(result.error)
      }
    })
  }

  return (
    <form action={onSubmit} className="space-y-4 text-right" noValidate>
      <div>
        <Label htmlFor="buildingName">اسم العمارة</Label>
        <Input id="buildingName" name="buildingName" required disabled={isPending} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="city">المدينة</Label>
          <Input id="city" name="city" disabled={isPending} />
        </div>
        <div>
          <Label htmlFor="defaultMonthlyFee">الرسوم الشهرية (ر.س)</Label>
          <Input
            id="defaultMonthlyFee"
            name="defaultMonthlyFee"
            type="number"
            min="0"
            step="0.01"
            defaultValue="0"
            disabled={isPending}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="address">العنوان (اختياري)</Label>
        <Input id="address" name="address" disabled={isPending} />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <Button type="submit" loading={isPending} className="w-full">
        {isPending ? 'جاري الإنشاء...' : 'إنشاء العمارة'}
      </Button>
    </form>
  )
}
