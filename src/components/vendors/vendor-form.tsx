'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RatingStars } from './rating-stars'
import { createVendorAction, updateVendorAction } from '@/actions/vendors'

interface Props {
  initial?: {
    id: string
    name: string
    phone: string | null
    specialty: string | null
    rating: number | null
    notes: string | null
  }
  /** Distinct specialties for the datalist autocompletion. */
  specialtySuggestions: string[]
  /** When true, the form is in edit mode (calls updateVendorAction). */
  editing?: boolean
}

export function VendorForm({ initial, specialtySuggestions, editing }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [rating, setRating] = useState<number | null>(initial?.rating ?? null)

  function onSubmit(formData: FormData) {
    setError(null)
    formData.set('rating', rating == null ? '' : String(rating))
    if (editing && initial) formData.set('vendor_id', initial.id)
    startTransition(async () => {
      const result = editing
        ? await updateVendorAction(formData)
        : await createVendorAction(formData)
      if (result.success) {
        toast.success(result.message ?? 'تم الحفظ')
        if (!editing && 'data' in result && result.data?.id) {
          router.replace(`/vendors/${result.data.id}`)
        } else if (editing && initial) {
          router.replace(`/vendors/${initial.id}`)
        } else {
          router.replace('/vendors')
        }
        router.refresh()
      } else {
        setError(result.error)
        toast.error(result.error)
      }
    })
  }

  const datalistId = 'vendor-specialty-suggestions'

  return (
    <form action={onSubmit} className="space-y-4" noValidate>
      <div>
        <Label htmlFor="name">الاسم</Label>
        <Input
          id="name"
          name="name"
          required
          minLength={2}
          maxLength={200}
          disabled={isPending}
          defaultValue={initial?.name}
          placeholder="مثلاً: مؤسسة الأمل للسباكة"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="phone">رقم الجوال</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            maxLength={30}
            disabled={isPending}
            defaultValue={initial?.phone ?? ''}
            placeholder="+9665…"
          />
        </div>

        <div>
          <Label htmlFor="specialty">التخصص</Label>
          <Input
            id="specialty"
            name="specialty"
            list={datalistId}
            maxLength={100}
            disabled={isPending}
            defaultValue={initial?.specialty ?? ''}
            placeholder="مثلاً: سباكة، كهرباء، تكييف"
          />
          <datalist id={datalistId}>
            {specialtySuggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
      </div>

      <div>
        <Label>التقييم</Label>
        <div className="mt-1.5">
          <RatingStars value={rating} onChange={setRating} size="h-7 w-7" />
        </div>
      </div>

      <div>
        <Label htmlFor="notes">ملاحظات (اختياري)</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          maxLength={2000}
          disabled={isPending}
          defaultValue={initial?.notes ?? ''}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" loading={isPending}>
          {editing ? 'حفظ التعديلات' : 'إنشاء المورد'}
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
