'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { updatePlatformSettingsAction } from '@/actions/marketing'

interface BankAccountValue {
  bank_name: string
  account_holder: string
  iban: string
  account_number: string
}

interface Props {
  bankAccount: BankAccountValue
  vatRate: number
  vatEnabled: boolean
}

/**
 * Platform settings UI — super_admin only.
 * Three sub-sections: bank account, VAT rate, VAT enabled toggle.
 * Each saves independently via updatePlatformSettingsAction.
 */
export function PlatformSettingsForm({ bankAccount, vatRate, vatEnabled }: Props) {
  return (
    <div className="space-y-6">
      <BankAccountCard initial={bankAccount} />
      <VatCard initialRate={vatRate} initialEnabled={vatEnabled} />
    </div>
  )
}

function BankAccountCard({ initial }: { initial: BankAccountValue }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [data, setData] = useState<BankAccountValue>(initial)

  function save() {
    if (!data.bank_name.trim() || !data.account_holder.trim()) {
      toast.error('اسم البنك واسم صاحب الحساب مَطلوبان')
      return
    }
    const fd = new FormData()
    fd.set('key', 'bank_account')
    fd.set('value', JSON.stringify(data))
    startTransition(async () => {
      const result = await updatePlatformSettingsAction(fd)
      if (result.success) {
        toast.success(result.message ?? 'تم الحفظ')
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>بيانات الحساب البنكي</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          تُعرض في صفحة الاشتراك (Phase 18) لاستلام التَحويلات. تأكَّد من صحَّة الـ IBAN.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="bank_name">اسم البنك</Label>
            <Input
              id="bank_name"
              value={data.bank_name}
              onChange={(e) => setData((d) => ({ ...d, bank_name: e.target.value }))}
              maxLength={120}
              disabled={isPending}
            />
          </div>
          <div>
            <Label htmlFor="account_holder">اسم صاحب الحساب</Label>
            <Input
              id="account_holder"
              value={data.account_holder}
              onChange={(e) =>
                setData((d) => ({ ...d, account_holder: e.target.value }))
              }
              maxLength={120}
              disabled={isPending}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="iban">IBAN</Label>
          <Input
            id="iban"
            value={data.iban}
            onChange={(e) => setData((d) => ({ ...d, iban: e.target.value }))}
            placeholder="SA00 0000 0000 0000 0000 0000"
            dir="ltr"
            maxLength={40}
            disabled={isPending}
          />
        </div>

        <div>
          <Label htmlFor="account_number">رقم الحساب</Label>
          <Input
            id="account_number"
            value={data.account_number}
            onChange={(e) =>
              setData((d) => ({ ...d, account_number: e.target.value }))
            }
            dir="ltr"
            maxLength={40}
            disabled={isPending}
          />
        </div>

        <Button onClick={save} loading={isPending}>
          حفظ بيانات البنك
        </Button>
      </CardContent>
    </Card>
  )
}

function VatCard({
  initialRate,
  initialEnabled,
}: {
  initialRate: number
  initialEnabled: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [rate, setRate] = useState(String(initialRate))
  const [enabled, setEnabled] = useState(initialEnabled)

  function saveRate() {
    const num = Number(rate)
    if (Number.isNaN(num) || num < 0 || num > 1) {
      toast.error('النسبة يجب أن تَكون بين 0 و 1 (مثلاً 0.15)')
      return
    }
    const fd = new FormData()
    fd.set('key', 'vat_rate')
    fd.set('value', JSON.stringify(num))
    startTransition(async () => {
      const result = await updatePlatformSettingsAction(fd)
      if (result.success) {
        toast.success(result.message ?? 'تم الحفظ')
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  function toggleEnabled(next: boolean) {
    const fd = new FormData()
    fd.set('key', 'vat_enabled')
    fd.set('value', JSON.stringify(next))
    startTransition(async () => {
      const result = await updatePlatformSettingsAction(fd)
      if (result.success) {
        setEnabled(next)
        toast.success(next ? 'تم تَفعيل VAT' : 'تم تَعطيل VAT')
        router.refresh()
      } else {
        toast.error(result.error)
        setEnabled(!next) // revert
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>ضريبة القيمة المضافة (VAT)</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          تُحتسب على subscription_orders (Phase 18). فعِّل VAT بعد التسجيل الضريبي
          الرسمي (إيرادات &gt; 375K SAR/سنة في KSA).
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="vat_enabled" className="text-base">
              تَفعيل VAT
            </Label>
            <p className="text-xs text-muted-foreground">
              {enabled ? 'مُفعَّل — يُحتسب على الفواتير' : 'مُعطَّل — لا يُضاف على الفواتير'}
            </p>
          </div>
          <Switch
            id="vat_enabled"
            checked={enabled}
            onCheckedChange={toggleEnabled}
            disabled={isPending}
          />
        </div>

        <div>
          <Label htmlFor="vat_rate">نسبة VAT (0 إلى 1)</Label>
          <div className="flex gap-2">
            <Input
              id="vat_rate"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              dir="ltr"
              placeholder="0.15"
              disabled={isPending}
              className="max-w-[200px]"
            />
            <Button onClick={saveRate} variant="outline" loading={isPending}>
              حفظ النسبة
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            في KSA: 0.15 = 15%
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
