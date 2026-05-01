'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { signupAndJoinAction } from '@/actions/joins'

interface Props {
  rawToken: string
  buildingName: string
  city: string | null
}

/**
 * Anon visitor signup form on /join/[token].
 *
 * v0.22.1: skip email confirmation. Action creates auth user (auto-confirmed),
 * signs them in, submits the pending request, then the form redirects to
 * /account/pending. No email click, no /join/finalize round-trip.
 */
export function JoinForm({ rawToken, buildingName, city }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(formData: FormData) {
    formData.set('raw_token', rawToken)
    startTransition(async () => {
      const result = await signupAndJoinAction(formData)
      if (result.success) {
        toast.success(result.message ?? 'تم إرسال طَلبك.')
        // User is now signed in + has a pending row. /account/pending
        // resolves what to show (resident pending join request).
        router.replace('/account/pending')
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-center mb-6">
          <div
            aria-hidden
            className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"
          >
            <Building2 className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-semibold">{buildingName}</h2>
          {city && <p className="text-sm text-muted-foreground mt-1">{city}</p>}
          <p className="text-sm text-muted-foreground mt-3">
            دُعيت للانضمام إلى هذه العمارة. سَجِّل بياناتك أدناه.
          </p>
        </div>

        <form action={onSubmit} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="full_name">
              الاسم الكامل <span className="text-destructive">*</span>
            </Label>
            <Input
              id="full_name"
              name="full_name"
              required
              minLength={2}
              maxLength={120}
              disabled={isPending}
              placeholder="مثلاً: سعد الغامدي"
            />
          </div>

          <div>
            <Label htmlFor="email">
              البريد الإلكتروني <span className="text-destructive">*</span>
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              dir="ltr"
              disabled={isPending}
              placeholder="saad@example.com"
            />
          </div>

          <div>
            <Label htmlFor="password">
              كلمة المرور <span className="text-destructive">*</span>
            </Label>
            <PasswordInput
              id="password"
              name="password"
              required
              minLength={8}
              maxLength={72}
              disabled={isPending}
              autoComplete="new-password"
              placeholder="8 أحرف على الأقل"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="apartment_number">رقم شقتك</Label>
              <Input
                id="apartment_number"
                name="apartment_number"
                disabled={isPending}
                maxLength={30}
                placeholder="مثلاً: 101"
              />
            </div>
            <div>
              <Label htmlFor="floor">الدور</Label>
              <Input
                id="floor"
                name="floor"
                type="number"
                min={-5}
                max={200}
                disabled={isPending}
                placeholder="مثلاً: 1"
              />
            </div>
            <div>
              <Label htmlFor="phone">رقم الجوال</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                dir="ltr"
                disabled={isPending}
                maxLength={40}
                placeholder="+966 5x xxx xxxx"
              />
            </div>
          </div>

          <Button type="submit" loading={isPending} className="w-full">
            إنشاء حساب وإرسال طلب الانضمام
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            بعد التَفعيل من إدارة العمارة، ستَتمكَّن من رؤية شقتك ومدفوعاتك.
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
