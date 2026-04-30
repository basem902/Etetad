'use client'

import { useState, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle2 } from 'lucide-react'
import { submitContactRequestAction } from '@/actions/marketing'
import type { PricingTier } from './pricing-cards'

interface Props {
  tiers: PricingTier[]
}

/**
 * Contact form للـ (marketing)/contact. anon-callable.
 * - يَقبل tier من query string (لو جاء من /pricing → اشترك).
 * - honeypot field invisible لـ bot detection.
 * - graceful UI: لو الـ submission نَجح في DB لكن البريد فَشل، يَظهر "تم الاستلام".
 */
export function ContactForm({ tiers }: Props) {
  const params = useSearchParams()
  const initialTier = params.get('tier') ?? ''
  const [isPending, startTransition] = useTransition()
  const [submitted, setSubmitted] = useState(false)

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await submitContactRequestAction(formData)
      if (result.success) {
        setSubmitted(true)
        toast.success(result.message ?? 'تم استلام طلبك، سنَتواصل معك قريباً.')
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
          <h3 className="text-xl font-semibold mb-2">تَم استلام طلبك</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            شكراً لاهتمامك بـ &quot;إدارة العمارة&quot;. سَنَتواصل معك خلال 24 ساعة على البريد
            الذي زوَّدتنا به لإكمال خطوات الاشتراك.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <form action={onSubmit} className="space-y-5" noValidate>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
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
            placeholder="مثلاً: أحمد العتيبي"
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
            placeholder="ahmad@example.com"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="phone">رقم الجوال</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            dir="ltr"
            disabled={isPending}
            placeholder="+966 5x xxx xxxx"
          />
        </div>

        <div>
          <Label htmlFor="city">المدينة</Label>
          <Input
            id="city"
            name="city"
            disabled={isPending}
            placeholder="الرياض"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="building_name">
          اسم العمارة <span className="text-destructive">*</span>
        </Label>
        <Input
          id="building_name"
          name="building_name"
          required
          minLength={2}
          maxLength={200}
          disabled={isPending}
          placeholder="مثلاً: عمارة الواحة"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="estimated_apartments">عدد الشقق التقريبي</Label>
          <Input
            id="estimated_apartments"
            name="estimated_apartments"
            type="number"
            min={1}
            max={10000}
            disabled={isPending}
            placeholder="6"
          />
        </div>

        <div>
          <Label htmlFor="interested_tier">الباقة المُهتَم بها</Label>
          <Select name="interested_tier" defaultValue={initialTier || undefined}>
            <SelectTrigger id="interested_tier" disabled={isPending}>
              <SelectValue placeholder="اختر باقة (اختياري)" />
            </SelectTrigger>
            <SelectContent>
              {tiers.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="message">رسالتك (اختياري)</Label>
        <Textarea
          id="message"
          name="message"
          rows={4}
          maxLength={2000}
          disabled={isPending}
          placeholder="كيف يُمكننا مساعدتك؟"
        />
      </div>

      {/*
        Honeypot — hidden from real users. Bots fill it → server rejects.
        aria-hidden + tabindex=-1 + autocomplete=off لتجنُّب أن يَكتشفه الـ
        accessibility tools.
      */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: '-10000px',
          top: 'auto',
          width: '1px',
          height: '1px',
          overflow: 'hidden',
        }}
      >
        <label htmlFor="company_website">Company website (do not fill)</label>
        <input
          id="company_website"
          name="honeypot"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <Button type="submit" loading={isPending} className="w-full sm:w-auto">
        إرسال الطلب
      </Button>

      <p className="text-xs text-muted-foreground">
        بإرسال الطلب فأنت توافق على تَواصلنا معك على البيانات المُقدَّمة.
      </p>
    </form>
  )
}
