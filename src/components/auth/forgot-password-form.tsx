'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { forgotPasswordAction } from '@/actions/auth'

export function ForgotPasswordForm() {
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function onSubmit(formData: FormData) {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await forgotPasswordAction(formData)
      if (result.success) {
        const m = result.message ?? 'تم إرسال الرابط'
        setMessage(m)
        toast.success(m)
      } else {
        setError(result.error)
        toast.error(result.error)
      }
    })
  }

  return (
    <form action={onSubmit} className="space-y-4" noValidate>
      <div>
        <Label htmlFor="email">البريد الإلكتروني</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={isPending}
          dir="ltr"
        />
      </div>

      {message && (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <Button type="submit" loading={isPending} className="w-full">
        {isPending ? 'جاري الإرسال...' : 'إرسال رابط إعادة التعيين'}
      </Button>

      <p className="text-center text-sm">
        <Link href="/login" className="text-muted-foreground hover:text-foreground">
          العودة لتسجيل الدخول
        </Link>
      </p>
    </form>
  )
}
