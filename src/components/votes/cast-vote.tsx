'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { RepresentationBanner } from './representation-banner'
import { castVoteAction } from '@/actions/governance'
import type { VoteOption } from '@/lib/voting'

interface Props {
  voteId: string
  options: VoteOption[]
  /** Apartments the user can vote for (rep + not-yet-voted). */
  votableApartments: { apartment_id: string; apartment_number: string }[]
}

/**
 * Casting UI. If the user can vote for multiple apartments (e.g. multi-owner),
 * they pick the apartment first, then the option, then submit. Each cast is
 * a separate transaction.
 */
export function CastVote({ voteId, options, votableApartments }: Props) {
  const router = useRouter()
  const [aptId, setAptId] = useState<string>(votableApartments[0]?.apartment_id ?? '')
  const [optionId, setOptionId] = useState<string>('')
  const [isPending, startTransition] = useTransition()

  const selectedApt = votableApartments.find((a) => a.apartment_id === aptId)
  const selectedOpt = options.find((o) => o.id === optionId)

  function handleCast() {
    if (!aptId || !optionId) {
      toast.error('اختر الشقة والخيار')
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      const fd = new FormData()
      fd.set('vote_id', voteId)
      fd.set('apartment_id', aptId)
      fd.set('option_id', optionId)
      startTransition(async () => {
        const r = await castVoteAction(fd)
        if (r.success) {
          toast.success(r.message ?? 'تم تسجيل صوتك')
          setOptionId('')
          router.refresh()
        } else {
          toast.error(r.error)
        }
        resolve()
      })
    })
  }

  if (votableApartments.length === 0) {
    return null
  }

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardHeader>
        <CardTitle className="text-base">إدلاء بصوتك</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {selectedApt && (
          <RepresentationBanner apartmentNumber={selectedApt.apartment_number} />
        )}

        {votableApartments.length > 1 && (
          <div>
            <Label htmlFor="apt">الشقة</Label>
            <Select value={aptId} onValueChange={setAptId} disabled={isPending}>
              <SelectTrigger id="apt">
                <SelectValue placeholder="اختر الشقة" />
              </SelectTrigger>
              <SelectContent>
                {votableApartments.map((a) => (
                  <SelectItem key={a.apartment_id} value={a.apartment_id}>
                    شقة {a.apartment_number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              تَملك حق التصويت لـ {votableApartments.length} شقق — صوّت لكل واحدة
              بشكل منفصل.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label>الخيار</Label>
          <div className="grid gap-2">
            {options.map((o) => (
              <label
                key={o.id}
                className={`flex items-center gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                  optionId === o.id
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-muted/30'
                }`}
              >
                <input
                  type="radio"
                  name="option"
                  value={o.id}
                  checked={optionId === o.id}
                  onChange={() => setOptionId(o.id)}
                  disabled={isPending}
                  className="accent-primary h-4 w-4"
                />
                <span className="font-medium">{o.label}</span>
              </label>
            ))}
          </div>
        </div>

        <ConfirmDialog
          title="تأكيد التصويت"
          description={`ستُسجَّل صوت "${selectedOpt?.label ?? '—'}" باسم شقة ${selectedApt?.apartment_number ?? '—'}. لا يمكن تعديل الصوت بعد الإرسال.`}
          confirmLabel="تأكيد التصويت"
          cancelLabel="تراجع"
          onConfirm={handleCast}
          trigger={
            <Button disabled={!aptId || !optionId || isPending} loading={isPending}>
              صوّت الآن
            </Button>
          }
        />
      </CardContent>
    </Card>
  )
}
