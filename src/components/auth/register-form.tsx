'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { registerBuildingAction } from '@/actions/auth'

export function RegisterForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await registerBuildingAction(formData)
      if (result.success) {
        toast.success(result.message ?? 'تم إنشاء العمارة')
        // Action returns where to go next (dashboard / onboarding / login),
        // depending on whether signup + building both succeeded, signup only,
        // or signup with email-confirmation pending.
        router.replace(result.redirectTo ?? '/dashboard')
        router.refresh()
      } else {
        setError(result.error)
        toast.error(result.error)
      }
    })
  }

  return (
    <form action={onSubmit} className="space-y-4" noValidate>
      <fieldset disabled={isPending} className="space-y-4">
        <legend className="text-sm font-semibold mb-2">بيانات الحساب</legend>

        <div>
          <Label htmlFor="fullName">الاسم الكامل</Label>
          <Input id="fullName" name="fullName" required autoComplete="name" />
        </div>

        <div>
          <Label htmlFor="email">البريد الإلكتروني</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            dir="ltr"
          />
        </div>

        <div>
          <Label htmlFor="password">كلمة المرور</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            8 أحرف على الأقل.
          </p>
        </div>
      </fieldset>

      <fieldset disabled={isPending} className="space-y-4 pt-2 border-t border-border">
        <legend className="text-sm font-semibold mb-2 mt-2">بيانات العمارة</legend>

        <div>
          <Label htmlFor="buildingName">اسم العمارة</Label>
          <Input id="buildingName" name="buildingName" required />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="city">المدينة</Label>
            <Input id="city" name="city" />
          </div>
          <div>
            <Label htmlFor="defaultMonthlyFee">الرسوم الشهرية الافتراضية (ر.س)</Label>
            <Input
              id="defaultMonthlyFee"
              name="defaultMonthlyFee"
              type="number"
              min="0"
              step="0.01"
              defaultValue="0"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="address">العنوان (اختياري)</Label>
          <Input id="address" name="address" />
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <Button type="submit" loading={isPending} className="w-full">
        {isPending ? 'جاري الإنشاء...' : 'إنشاء العمارة'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        لديك حساب بالفعل؟{' '}
        <Link href="/login" className="font-medium text-foreground underline">
          تسجيل الدخول
        </Link>
      </p>
    </form>
  )
}
