'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createRenewalOrderAction } from '@/actions/subscriptions'

const TIER_NAMES: Record<string, string> = {
  basic: 'أساسية',
  pro: 'احترافية',
  enterprise: 'مؤسسات',
}

interface Props {
  buildingId: string
  buildingName: string
  currentTier: string
  currentEndsAt: string | null
}

export function RenewForm({
  buildingId,
  buildingName,
  currentTier,
  currentEndsAt,
}: Props) {
  const router = useRouter()
  const [tier, setTier] = useState<string>(currentTier)
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('yearly')
  const [isPending, startTransition] = useTransition()

  const isPlanChange = tier !== currentTier
  const endDate = currentEndsAt
    ? new Date(currentEndsAt).toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '—'

  function onSubmit(formData: FormData) {
    formData.set('building_id', buildingId)
    formData.set('tier_id', tier)
    formData.set('cycle', cycle)
    startTransition(async () => {
      const res = await createRenewalOrderAction(formData)
      if (res.success) {
        toast.success('تم إنشاء طلب التَجديد. أُرسلت تَفاصيل التَحويل بالبريد.')
        router.push(res.receiptUrl)
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          تجديد اشتراك {buildingName}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-6 rounded-md border bg-muted/50 p-4 text-sm">
          <p className="text-muted-foreground">
            الباقة الحالية:{' '}
            <strong className="text-foreground">
              {TIER_NAMES[currentTier] ?? currentTier}
            </strong>
          </p>
          <p className="text-muted-foreground">
            الانتهاء الحالي: <strong className="text-foreground">{endDate}</strong>
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            التَجديد المُبكِر يَحفظ الأيام المُتبقية ويُضيف إليها مدَّة الباقة
            الجديدة.
          </p>
        </div>

        <form action={onSubmit} className="space-y-5" noValidate>
          <div>
            <Label htmlFor="tier">الباقة الجديدة</Label>
            <Select
              value={tier}
              onValueChange={setTier}
              disabled={isPending}
            >
              <SelectTrigger id="tier">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="basic">{TIER_NAMES.basic}</SelectItem>
                <SelectItem value="pro">{TIER_NAMES.pro}</SelectItem>
                <SelectItem value="enterprise">
                  {TIER_NAMES.enterprise}
                </SelectItem>
              </SelectContent>
            </Select>
            {isPlanChange && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                ⚠️ ستَتغيَّر الباقة من {TIER_NAMES[currentTier] ?? currentTier}{' '}
                إلى {TIER_NAMES[tier] ?? tier} عند اعتماد الدفع.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="cycle">الدورة</Label>
            <Select
              value={cycle}
              onValueChange={(v) => setCycle(v as 'monthly' | 'yearly')}
              disabled={isPending}
            >
              <SelectTrigger id="cycle">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">شهرياً</SelectItem>
                <SelectItem value="yearly">سنوياً</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" loading={isPending} className="w-full">
            <CheckCircle2 className="h-4 w-4" />
            متابعة لتفاصيل التَحويل
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
