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
import {
  createApartmentAction,
  updateApartmentAction,
} from '@/actions/apartments'
import type { ApartmentStatus } from '@/types/database'

interface Props {
  mode: 'create' | 'edit'
  apartmentId?: string
  initial?: {
    number: string
    floor: number | null
    monthly_fee: number
    status: ApartmentStatus
    notes: string | null
  }
}

export function ApartmentForm({ mode, apartmentId, initial }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<ApartmentStatus>(initial?.status ?? 'vacant')

  function onSubmit(formData: FormData) {
    setError(null)
    formData.set('status', status)
    startTransition(async () => {
      const result =
        mode === 'create'
          ? await createApartmentAction(formData)
          : await updateApartmentAction(apartmentId!, formData)

      if (result.success) {
        toast.success(result.message ?? (mode === 'create' ? 'تم الإنشاء' : 'تم التحديث'))
        if (mode === 'create' && 'data' in result && result.data?.id) {
          router.replace(`/apartments/${result.data.id}`)
        } else {
          router.refresh()
        }
      } else {
        setError(result.error)
        toast.error(result.error)
      }
    })
  }

  return (
    <form action={onSubmit} className="space-y-4" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="number">رقم الشقة</Label>
          <Input
            id="number"
            name="number"
            required
            disabled={isPending}
            defaultValue={initial?.number ?? ''}
          />
        </div>
        <div>
          <Label htmlFor="floor">الطابق</Label>
          <Input
            id="floor"
            name="floor"
            type="number"
            inputMode="numeric"
            disabled={isPending}
            defaultValue={initial?.floor ?? ''}
            placeholder="مثلاً 1"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="monthly_fee">الرسوم الشهرية (ر.س)</Label>
          <Input
            id="monthly_fee"
            name="monthly_fee"
            type="number"
            min="0"
            step="0.01"
            disabled={isPending}
            defaultValue={initial?.monthly_fee ?? 0}
          />
        </div>
        <div>
          <Label htmlFor="status">الحالة</Label>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as ApartmentStatus)}
            disabled={isPending}
          >
            <SelectTrigger id="status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vacant">شاغرة</SelectItem>
              <SelectItem value="occupied">مأهولة</SelectItem>
              <SelectItem value="under_maintenance">قيد الصيانة</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="notes">ملاحظات (اختياري)</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          disabled={isPending}
          defaultValue={initial?.notes ?? ''}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" loading={isPending}>
          {mode === 'create' ? 'إنشاء الشقة' : 'حفظ التغييرات'}
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
