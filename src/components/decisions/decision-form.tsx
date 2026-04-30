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
import { createDecisionAction } from '@/actions/governance'
import { DECISION_STATUSES } from '@/lib/validations/governance'
import type { DecisionStatus } from '@/types/database'

const STATUS_LABELS: Record<DecisionStatus, string> = {
  approved: 'معتمد',
  rejected: 'مرفوض',
  implemented: 'مُنفَّذ',
  postponed: 'مُؤجَّل',
}

const NO_VOTE = '__none__'

interface Props {
  /** Closed votes available to link to. */
  closedVotes: { id: string; title: string }[]
  /** Pre-selected vote_id (e.g. from "create decision from vote" link). */
  defaultVoteId?: string
  defaultTitle?: string
}

export function DecisionForm({ closedVotes, defaultVoteId, defaultTitle }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<DecisionStatus>('approved')
  const [voteId, setVoteId] = useState<string>(defaultVoteId ?? NO_VOTE)

  function onSubmit(formData: FormData) {
    setError(null)
    formData.set('status', status)
    formData.set('vote_id', voteId === NO_VOTE ? '' : voteId)
    startTransition(async () => {
      const r = await createDecisionAction(formData)
      if (r.success) {
        toast.success(r.message ?? 'تم تسجيل القرار')
        if ('data' in r && r.data?.id) {
          router.replace(`/decisions/${r.data.id}`)
        } else {
          router.replace('/decisions')
        }
        router.refresh()
      } else {
        setError(r.error)
        toast.error(r.error)
      }
    })
  }

  return (
    <form action={onSubmit} className="space-y-4" noValidate>
      <div>
        <Label htmlFor="title">عنوان القرار</Label>
        <Input
          id="title"
          name="title"
          required
          minLength={2}
          maxLength={200}
          disabled={isPending}
          defaultValue={defaultTitle}
          placeholder="مثلاً: اعتماد صيانة المصعد بقيمة 5000 ر.س"
        />
      </div>

      <div>
        <Label htmlFor="description">الوصف (اختياري)</Label>
        <Textarea
          id="description"
          name="description"
          rows={3}
          maxLength={2000}
          disabled={isPending}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="status">الحالة</Label>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as DecisionStatus)}
            disabled={isPending}
          >
            <SelectTrigger id="status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DECISION_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="decision_date">تاريخ القرار</Label>
          <Input
            id="decision_date"
            name="decision_date"
            type="date"
            disabled={isPending}
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="vote_id">مرتبط بتصويت (اختياري)</Label>
        <Select value={voteId} onValueChange={setVoteId} disabled={isPending}>
          <SelectTrigger id="vote_id">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_VOTE}>قرار مستقل (بدون تصويت)</SelectItem>
            {closedVotes.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-1">
          فقط التصويتات المُغلقة يمكن ربطها بقرار.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" loading={isPending}>
          تسجيل القرار
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
