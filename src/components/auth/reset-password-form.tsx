'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { resetPasswordAction } from '@/actions/auth'

export function ResetPasswordForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await resetPasswordAction(formData)
      if (result.success) {
        toast.success(result.message ?? 'تم تحديث كلمة المرور')
        router.replace('/dashboard')
        router.refresh()
      } else {
        setError(result.error)
        toast.error(result.error)
      }
    })
  }

  return (
    <form action={onSubmit} className="space-y-4" noValidate>
      <div>
        <Label htmlFor="password">كلمة المرور الجديدة</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          disabled={isPending}
        />
        <p className="mt-1 text-xs text-muted-foreground">8 أحرف على الأقل.</p>
      </div>

      <div>
        <Label htmlFor="confirm">تأكيد كلمة المرور</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          disabled={isPending}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <Button type="submit" loading={isPending} className="w-full">
        {isPending ? 'جاري التحديث...' : 'تحديث كلمة المرور'}
      </Button>
    </form>
  )
}
