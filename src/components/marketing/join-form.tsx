'use client'

import { useState, useTransition } from 'react'
import { Building2, CheckCircle2 } from 'lucide-react'
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
 * After submission, Supabase sends a confirmation email; the user clicks
 * the link → /auth/callback → /join/finalize → submit_join_request RPC.
 */
export function JoinForm({ rawToken, buildingName, city }: Props) {
  const [isPending, startTransition] = useTransition()
  const [submitted, setSubmitted] = useState(false)

  function onSubmit(formData: FormData) {
    formData.set('raw_token', rawToken)
    startTransition(async () => {
      const result = await signupAndJoinAction(formData)
      if (result.success) {
        setSubmitted(true)
        toast.success(result.message ?? 'تم — افحص بريدك.')
      } else {
        toast.error(result.error)
      }
    })
  }

  if (submitted) {
    return (
      <Card>
        <CardContent className="pt-8 pb-10 text-center">
          <div
            aria-hidden
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success"
          >
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h3 className="text-xl font-semibold mb-2">افحص بريدك</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            أرسلنا رابط تأكيد. اضغطه لإكمال إنشاء حسابك. بعدها، طلبك يَنتظر
            مُوافقة إدارة العمارة (عادةً خلال 24 ساعة).
          </p>
          <p className="text-xs text-muted-foreground mt-4">
            لم يَصل البريد؟ افحص spam folder أو اطلب من الإدارة إعادة الإرسال.
          </p>
        </CardContent>
      </Card>
    )
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
