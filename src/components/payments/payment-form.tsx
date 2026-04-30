'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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
import { ReceiptUploader } from './receipt-uploader'
import { createPaymentAction } from '@/actions/payments'
import type { PaymentMethod } from '@/types/database'
import { PAYMENT_METHODS } from '@/lib/validations/payments'

interface Props {
  apartments: { id: string; number: string }[]
  defaultApartmentId?: string
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'نقد',
  bank_transfer: 'تحويل بنكي',
  online: 'تحويل أونلاين',
  cheque: 'شيك',
}

const today = () => new Date().toISOString().slice(0, 10) // YYYY-MM-DD
const thisMonth = () => new Date().toISOString().slice(0, 7) // YYYY-MM

export function PaymentForm({ apartments, defaultApartmentId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [apartmentId, setApartmentId] = useState<string>(
    defaultApartmentId ?? apartments[0]?.id ?? '',
  )
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer')

  function onSubmit(formData: FormData) {
    setError(null)
    formData.set('apartment_id', apartmentId)
    formData.set('method', method)
    startTransition(async () => {
      const result = await createPaymentAction(formData)
      if (result.success) {
        toast.success(result.message ?? 'تم تسجيل الدفعة')
        if ('data' in result && result.data?.id) {
          router.replace(`/payments/${result.data.id}`)
        } else {
          router.replace('/payments')
        }
        router.refresh()
      } else {
        setError(result.error)
        toast.error(result.error)
      }
    })
  }

  if (apartments.length === 0) {
    return (
      <div className="rounded-md border border-warning/40 bg-warning/5 p-4 text-sm">
        لست مرتبطاً بأي شقة بعد. اطلب من المدير ربطك بشقتك.
      </div>
    )
  }

  return (
    <form action={onSubmit} className="space-y-4" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="apartment_id">الشقة</Label>
          <Select
            value={apartmentId}
            onValueChange={setApartmentId}
            disabled={isPending}
          >
            <SelectTrigger id="apartment_id">
              <SelectValue placeholder="اختر الشقة" />
            </SelectTrigger>
            <SelectContent>
              {apartments.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  شقة {a.number}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="amount">المبلغ (ر.س)</Label>
          <Input
            id="amount"
            name="amount"
            type="number"
            min="0"
            step="0.01"
            required
            disabled={isPending}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="payment_date">تاريخ الدفع</Label>
          <Input
            id="payment_date"
            name="payment_date"
            type="date"
            required
            disabled={isPending}
            defaultValue={today()}
          />
        </div>
        <div>
          <Label htmlFor="period_month">الشهر المُستحَق عنه</Label>
          <Input
            id="period_month"
            name="period_month"
            type="month"
            required
            disabled={isPending}
            defaultValue={thisMonth()}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="method">طريقة الدفع</Label>
        <Select
          value={method}
          onValueChange={(v) => setMethod(v as PaymentMethod)}
          disabled={isPending}
        >
          <SelectTrigger id="method">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_METHODS.map((m) => (
              <SelectItem key={m} value={m}>
                {METHOD_LABELS[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="receipt">إيصال الدفع (إلزامي)</Label>
        <ReceiptUploader name="receipt" required disabled={isPending} />
      </div>

      <div>
        <Label htmlFor="notes">ملاحظات (اختياري)</Label>
        <Textarea id="notes" name="notes" rows={2} disabled={isPending} />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" loading={isPending}>
          تسجيل الدفعة
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={isPending}
        >
          إلغاء
        </Button>
      </div>
    </form>
  )
}
