'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { loginAction } from '@/actions/auth'

export function LoginForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await loginAction(formData)
      if (result.success) {
        toast.success(result.message ?? 'تم تسجيل الدخول')
        // Route to /dashboard so (app)/layout.tsx can dispatch:
        //   super_admin → /super-admin
        //   no buildings → /onboarding (or /account/pending)
        //   has buildings → render dashboard
        // Phase 16 made `/` a public marketing landing — the previous
        // `router.replace('/')` left logged-in users stuck on the landing
        // (RC1+3 fix).
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

      <div>
        <Label htmlFor="password">كلمة المرور</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={isPending}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <Button type="submit" loading={isPending} className="w-full">
        {isPending ? 'جاري الدخول...' : 'تسجيل الدخول'}
      </Button>

      <div className="text-center text-sm space-y-2 pt-2">
        <Link
          href="/forgot-password"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          نسيت كلمة المرور؟
        </Link>
        <p className="text-muted-foreground">
          ليس لديك حساب؟{' '}
          <Link href="/subscribe?tier=pro&cycle=yearly" className="font-medium text-foreground underline">
            اشترك الآن
          </Link>
        </p>
      </div>
    </form>
  )
}
