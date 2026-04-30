'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  createSuggestionAction,
  updateSuggestionAction,
} from '@/actions/governance'

interface Props {
  initial?: {
    id: string
    title: string
    description: string | null
  }
  editing?: boolean
}

export function SuggestionForm({ initial, editing }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onSubmit(formData: FormData) {
    setError(null)
    if (editing && initial) formData.set('suggestion_id', initial.id)
    startTransition(async () => {
      const result = editing
        ? await updateSuggestionAction(formData)
        : await createSuggestionAction(formData)
      if (result.success) {
        toast.success(result.message ?? 'تم الحفظ')
        if (!editing && 'data' in result && result.data?.id) {
          router.replace(`/suggestions/${result.data.id}`)
        } else if (editing && initial) {
          router.replace(`/suggestions/${initial.id}`)
        } else {
          router.replace('/suggestions')
        }
        router.refresh()
      } else {
        setError(result.error)
        toast.error(result.error)
      }
    })
  }

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
          placeholder="مثلاً: تركيب كاميرات مراقبة في المدخل"
        />
      </div>

      <div>
        <Label htmlFor="description">الوصف (اختياري)</Label>
        <Textarea
          id="description"
          name="description"
          rows={5}
          maxLength={2000}
          disabled={isPending}
          defaultValue={initial?.description ?? ''}
          placeholder="اشرح اقتراحك بتفاصيل تساعد بقية السكان على التقييم."
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" loading={isPending}>
          {editing ? 'حفظ التعديلات' : 'إرسال الاقتراح'}
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
