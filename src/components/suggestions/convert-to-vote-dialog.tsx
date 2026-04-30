'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Vote, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { createVoteAction } from '@/actions/governance'
import type { ApprovalRule } from '@/types/database'

const APPROVAL_LABELS: Record<ApprovalRule, string> = {
  simple_majority: 'أغلبية بسيطة (>50%)',
  two_thirds: 'ثلثا الأصوات (≥66.67%)',
  custom: 'نسبة مخصَّصة',
}

interface Props {
  suggestionId: string
  defaultTitle: string
  defaultDescription: string | null
}

function defaultEndsAt(): string {
  // 7 days from now, formatted as YYYY-MM-DDTHH:MM (datetime-local input format)
  const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 16)
}

export function ConvertToVoteDialog({
  suggestionId,
  defaultTitle,
  defaultDescription,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [options, setOptions] = useState<string[]>(['نعم', 'لا'])
  const [rule, setRule] = useState<ApprovalRule>('simple_majority')

  function addOption() {
    if (options.length >= 10) return
    setOptions((prev) => [...prev, ''])
  }

  function removeOption(idx: number) {
    if (options.length <= 2) return
    setOptions((prev) => prev.filter((_, i) => i !== idx))
  }

  function updateOption(idx: number, value: string) {
    setOptions((prev) => prev.map((o, i) => (i === idx ? value : o)))
  }

  function handleSubmit(formData: FormData) {
    formData.set('suggestion_id', suggestionId)
    formData.set('approval_rule', rule)
    // Replace any options[] entries with our managed list
    formData.delete('options')
    options.forEach((o) => {
      if (o.trim()) formData.append('options', o.trim())
    })

    startTransition(async () => {
      const result = await createVoteAction(formData)
      if (result.success) {
        toast.success(result.message ?? 'تم التحويل')
        setOpen(false)
        if ('data' in result && result.data?.id) {
          router.push(`/votes/${result.data.id}`)
        } else {
          router.refresh()
        }
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)} disabled={isPending}>
        <Vote className="h-4 w-4" />
        تحويل إلى تصويت
      </Button>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>تحويل الاقتراح إلى تصويت</DialogTitle>
          <DialogDescription>
            سيُنشَأ التصويت كـ مسودّة. تَقدر تَفعّله بعد المراجعة. التصويت per-apartment
            (صوت واحد لكل شقة عبر ممثل التصويت).
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="title">عنوان التصويت</Label>
            <Input
              id="title"
              name="title"
              required
              minLength={2}
              maxLength={200}
              disabled={isPending}
              defaultValue={defaultTitle}
            />
          </div>

          <div>
            <Label htmlFor="description">الوصف</Label>
            <Textarea
              id="description"
              name="description"
              rows={3}
              maxLength={2000}
              disabled={isPending}
              defaultValue={defaultDescription ?? ''}
            />
          </div>

          <div>
            <Label>الخيارات (2 على الأقل)</Label>
            <div className="space-y-2 mt-1">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={opt}
                    onChange={(e) => updateOption(i, e.target.value)}
                    placeholder={`الخيار ${i + 1}`}
                    maxLength={200}
                    required
                    disabled={isPending}
                    className="flex-1"
                  />
                  {options.length > 2 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeOption(i)}
                      disabled={isPending}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              {options.length < 10 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addOption}
                  disabled={isPending}
                >
                  <Plus className="h-4 w-4" />
                  إضافة خيار
                </Button>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="ends_at">تاريخ ووقت الإغلاق</Label>
              <Input
                id="ends_at"
                name="ends_at"
                type="datetime-local"
                required
                disabled={isPending}
                defaultValue={defaultEndsAt()}
              />
            </div>
            <div>
              <Label htmlFor="approval_rule">قاعدة القبول</Label>
              <Select
                value={rule}
                onValueChange={(v) => setRule(v as ApprovalRule)}
                disabled={isPending}
              >
                <SelectTrigger id="approval_rule">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['simple_majority', 'two_thirds', 'custom'] as const).map((r) => (
                    <SelectItem key={r} value={r}>
                      {APPROVAL_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {rule === 'custom' && (
            <div>
              <Label htmlFor="custom_threshold">النسبة المطلوبة (0..1)</Label>
              <Input
                id="custom_threshold"
                name="custom_threshold"
                type="number"
                step="0.01"
                min="0.01"
                max="1"
                disabled={isPending}
                placeholder="مثلاً: 0.75 لـ 75%"
              />
            </div>
          )}

          <div>
            <Label htmlFor="estimated_cost">التكلفة المتوقَّعة (اختياري)</Label>
            <Input
              id="estimated_cost"
              name="estimated_cost"
              type="number"
              min="0"
              step="0.01"
              disabled={isPending}
              placeholder="ر.س"
            />
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                تراجع
              </Button>
            </DialogClose>
            <Button type="submit" loading={isPending}>
              إنشاء التصويت
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
