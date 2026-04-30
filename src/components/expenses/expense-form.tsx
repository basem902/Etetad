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
import { InvoiceUploader } from './invoice-uploader'
import { createExpenseAction, updateExpenseAction } from '@/actions/expenses'

const NO_VENDOR = '__none__'

interface Props {
  vendors: { id: string; name: string }[]
  /** Distinct categories used in this building — datalist suggestions. */
  categorySuggestions: string[]
  initial?: {
    id: string
    title: string
    description: string | null
    category: string | null
    amount: number
    expense_date: string
    vendor_id: string | null
    invoice_url: string | null
  }
  /** When true, the form is in edit mode (uses updateExpenseAction). */
  editing?: boolean
}

const today = () => new Date().toISOString().slice(0, 10)

export function ExpenseForm({
  vendors,
  categorySuggestions,
  initial,
  editing,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [vendorId, setVendorId] = useState<string>(
    initial?.vendor_id ?? NO_VENDOR,
  )

  function onSubmit(formData: FormData) {
    setError(null)
    formData.set('vendor_id', vendorId === NO_VENDOR ? '' : vendorId)
    if (editing && initial) formData.set('expense_id', initial.id)
    startTransition(async () => {
      const result = editing
        ? await updateExpenseAction(formData)
        : await createExpenseAction(formData)
      if (result.success) {
        toast.success(result.message ?? 'تم الحفظ')
        if (!editing && 'data' in result && result.data?.id) {
          router.replace(`/expenses/${result.data.id}`)
        } else if (editing && initial) {
          router.replace(`/expenses/${initial.id}`)
        } else {
          router.replace('/expenses')
        }
        router.refresh()
      } else {
        setError(result.error)
        toast.error(result.error)
      }
    })
  }

  const datalistId = 'expense-category-suggestions'

  return (
    <form action={onSubmit} className="space-y-4" noValidate>
      <div>
        <Label htmlFor="title">العنوان</Label>
        <Input
          id="title"
          name="title"
          required
          minLength={2}
          maxLength={200}
          disabled={isPending}
          defaultValue={initial?.title}
          placeholder="مثلاً: فاتورة كهرباء شهر مارس"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
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
            defaultValue={initial?.amount}
          />
        </div>
        <div>
          <Label htmlFor="expense_date">تاريخ المصروف</Label>
          <Input
            id="expense_date"
            name="expense_date"
            type="date"
            required
            disabled={isPending}
            defaultValue={initial?.expense_date ?? today()}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="category">التصنيف</Label>
          <Input
            id="category"
            name="category"
            list={datalistId}
            disabled={isPending}
            maxLength={80}
            defaultValue={initial?.category ?? ''}
            placeholder="مثلاً: كهرباء، صيانة، تنظيف"
          />
          <datalist id={datalistId}>
            {categorySuggestions.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div>
          <Label htmlFor="vendor_id">المورد (اختياري)</Label>
          <Select value={vendorId} onValueChange={setVendorId} disabled={isPending}>
            <SelectTrigger id="vendor_id">
              <SelectValue placeholder="اختر المورد" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_VENDOR}>بدون مورد</SelectItem>
              {vendors.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="description">الوصف (اختياري)</Label>
        <Textarea
          id="description"
          name="description"
          rows={3}
          maxLength={2000}
          disabled={isPending}
          defaultValue={initial?.description ?? ''}
        />
      </div>

      <div>
        <Label htmlFor="invoice">
          الفاتورة {initial?.invoice_url ? '(اتركه فارغاً للإبقاء على الحالية)' : '(اختياري)'}
        </Label>
        <InvoiceUploader name="invoice" disabled={isPending} />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" loading={isPending}>
          {editing ? 'حفظ التعديلات' : 'حفظ كمسودّة'}
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
