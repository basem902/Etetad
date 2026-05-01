'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createSubscriptionOrderAction } from '@/actions/subscriptions'

const TIER_NAMES: Record<string, string> = {
  basic: 'أساسية',
  pro: 'احترافية',
  enterprise: 'مؤسسات',
}

interface Props {
  /** preset tier_id from /pricing query param (basic/pro/enterprise) */
  initialTier?: string
  /** preset cycle from /pricing query param (monthly/yearly) */
  initialCycle?: 'monthly' | 'yearly'
}

export function SubscribeForm({ initialTier = 'pro', initialCycle = 'yearly' }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const [tier, setTier] = useState<string>(params.get('tier') ?? initialTier)
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>(
    (params.get('cycle') as 'monthly' | 'yearly') ?? initialCycle,
  )
  const [isPending, startTransition] = useTransition()

  function onSubmit(formData: FormData) {
    formData.set('tier_id', tier)
    formData.set('cycle', cycle)

    startTransition(async () => {
      const result = await createSubscriptionOrderAction(formData)
      if (result.success) {
        toast.success('تم إنشاء الطلب — أرسلنا التَفاصيل لبريدك.')
        // Redirect to receipt-upload page with token in URL
        router.push(`/subscribe/${result.orderId}?t=${result.rawToken}`)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>اشتراك جديد</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          الباقة المختارة:{' '}
          <strong>{TIER_NAMES[tier] ?? tier}</strong> ({cycle === 'monthly' ? 'شهري' : 'سنوي'})
        </p>
      </CardHeader>
      <CardContent>
        <form action={onSubmit} className="space-y-5" noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="tier_id_select">الباقة</Label>
              <Select value={tier} onValueChange={setTier}>
                <SelectTrigger id="tier_id_select" disabled={isPending}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">أساسية</SelectItem>
                  <SelectItem value="pro">احترافية</SelectItem>
                  <SelectItem value="enterprise">مؤسسات</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="cycle_select">الفترة</Label>
              <Select
                value={cycle}
                onValueChange={(v) => setCycle(v as 'monthly' | 'yearly')}
              >
                <SelectTrigger id="cycle_select" disabled={isPending}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">شهري</SelectItem>
                  <SelectItem value="yearly">سنوي (شهران مَجاناً)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                placeholder="أحمد العتيبي"
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="phone">
                رقم الجوال <span className="text-destructive">*</span>
              </Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                required
                dir="ltr"
                minLength={5}
                maxLength={40}
                disabled={isPending}
                placeholder="+966 5x xxx xxxx"
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
                dir="ltr"
                autoComplete="new-password"
                disabled={isPending}
                placeholder="٨ أحرف على الأقل"
              />
              <p className="text-xs text-muted-foreground mt-1">
                ستَستَخدمها للدخول بعد اعتماد طلبك من إدارة المنصة.
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor="city">المدينة (اختياري)</Label>
            <Input
              id="city"
              name="city"
              maxLength={80}
              disabled={isPending}
              placeholder="الرياض"
            />
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
              placeholder="عمارة الواحة"
            />
          </div>

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

          <div className="rounded-md bg-muted/40 p-3 text-sm space-y-1.5">
            <div className="flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="h-4 w-4 text-success" />
              ماذا يَحدث بعد الإرسال؟
            </div>
            <ul className="text-xs text-muted-foreground space-y-0.5 mr-5 list-disc">
              <li>يُنشأ حسابك مَع كلمة المرور التي اخترتها</li>
              <li>سَنَعرض عليك بيانات حساب بنكي + رقم مرجع</li>
              <li>تُحوِّل المبلغ مع ذكر رقم المرجع في حقل البيان</li>
              <li>تَرفَع صورة الإيصال على نَفس الصفحة</li>
              <li>إدارة المنصة تُراجع التحويل خلال 24 ساعة وتَعتمد طَلبك</li>
              <li>تَدخل لوحة عمارتك بـ بَريدك + كلمة مرورك</li>
            </ul>
          </div>

          <Button type="submit" loading={isPending} className="w-full">
            إنشاء الطلب
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
