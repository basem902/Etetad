'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { changeSuggestionStatusAction } from '@/actions/governance'
import type { SuggestionStatus } from '@/types/database'

const STATUS_LABELS: Record<string, string> = {
  discussion: 'نقاش',
  pricing: 'تسعير',
  approved: 'معتمد',
  rejected: 'مرفوض',
  archived: 'مؤرشف',
}

interface Props {
  suggestionId: string
  currentStatus: SuggestionStatus
}

/**
 * Inline status changer for managers. Available targets depend on current
 * status (mirrors trigger whitelist).
 */
export function StatusActions({ suggestionId, currentStatus }: Props) {
  const router = useRouter()
  const [target, setTarget] = useState<string>('')
  const [isPending, startTransition] = useTransition()

  // Available transitions per current status (subset of trigger whitelist)
  const transitions: Record<SuggestionStatus, string[]> = {
    new: ['discussion', 'pricing', 'rejected', 'archived', 'approved'],
    discussion: ['pricing', 'rejected', 'archived', 'approved'],
    pricing: ['rejected', 'archived', 'approved'],
    approved: ['archived'],
    converted_to_vote: [],
    rejected: [],
    archived: [],
  }

  const available = transitions[currentStatus] ?? []

  if (available.length === 0) return null

  function handleApply() {
    if (!target) return
    const fd = new FormData()
    fd.set('suggestion_id', suggestionId)
    fd.set('status', target)
    startTransition(async () => {
      const r = await changeSuggestionStatusAction(fd)
      if (r.success) {
        toast.success(r.message ?? 'تم التحديث')
        setTarget('')
        router.refresh()
      } else {
        toast.error(r.error)
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={target} onValueChange={setTarget} disabled={isPending}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="انقل إلى..." />
        </SelectTrigger>
        <SelectContent>
          {available.map((s) => (
            <SelectItem key={s} value={s}>
              {STATUS_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button onClick={handleApply} disabled={!target || isPending} loading={isPending}>
        تطبيق
      </Button>
    </div>
  )
}
