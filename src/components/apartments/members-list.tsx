'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Crown, MoreHorizontal, Trash2, UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmptyState } from '@/components/shared/empty-state'
import { changeVotingRepAction, deactivateMemberAction } from '@/actions/apartments'
import { relationLabel } from './apartment-status-badge'
import type { ApartmentMemberRow } from '@/lib/queries/apartments'

function initials(name: string | null): string {
  if (!name) return '؟'
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '؟'
  if (parts.length === 1) return parts[0]!.slice(0, 2)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
}

interface Props {
  apartmentId: string
  members: ApartmentMemberRow[]
}

export function MembersList({ apartmentId, members }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [removing, setRemoving] = useState<ApartmentMemberRow | null>(null)
  const [replacementId, setReplacementId] = useState<string>('')

  if (members.length === 0) {
    return (
      <EmptyState
        title="لا يوجد أعضاء"
        description='اضغط "إضافة عضو" لربط أول ساكن بالشقة.'
      />
    )
  }

  function handleSetRep(memberId: string) {
    const fd = new FormData()
    fd.set('apartment_id', apartmentId)
    fd.set('new_member_id', memberId)
    startTransition(async () => {
      const result = await changeVotingRepAction(fd)
      if (result.success) {
        toast.success(result.message ?? 'تم تغيير ممثل التصويت')
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  function confirmRemove(member: ApartmentMemberRow) {
    setRemoving(member)
    setReplacementId('')
  }

  function handleRemove() {
    if (!removing) return
    const fd = new FormData()
    fd.set('member_id', removing.id)
    if (removing.is_voting_representative && replacementId) {
      fd.set('replacement_member_id', replacementId)
    }
    startTransition(async () => {
      const result = await deactivateMemberAction(apartmentId, fd)
      if (result.success) {
        toast.success(result.message ?? 'تمت الإزالة')
        setRemoving(null)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  const otherActiveMembers = members.filter((m) => m.id !== removing?.id)

  return (
    <>
      <ul className="space-y-2">
        {members.map((m) => (
          <li
            key={m.id}
            className="flex items-center justify-between gap-3 rounded-md border border-border p-3 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Avatar className="h-9 w-9">
                <AvatarFallback>{initials(m.full_name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate">
                    {m.full_name ?? 'بدون اسم'}
                  </span>
                  {m.is_voting_representative && (
                    <Badge variant="warning" className="gap-1">
                      <Crown className="h-3 w-3" />
                      ممثل التصويت
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <span>{relationLabel(m.relation_type)}</span>
                  {m.phone && (
                    <>
                      <span aria-hidden>·</span>
                      <a href={`tel:${m.phone}`} className="hover:text-foreground" dir="ltr">
                        {m.phone}
                      </a>
                    </>
                  )}
                </div>
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" disabled={isPending} aria-label="إجراءات">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {!m.is_voting_representative && (
                  <DropdownMenuItem onClick={() => handleSetRep(m.id)}>
                    <UserCheck className="h-4 w-4" />
                    تعيين كممثل تصويت
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => confirmRemove(m)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  إزالة من الشقة
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        ))}
      </ul>

      <Dialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إزالة العضو</DialogTitle>
            <DialogDescription>
              {removing?.is_voting_representative
                ? 'هذا العضو ممثل التصويت الحالي. اختر بديلاً قبل إتمام الإزالة.'
                : `هل تريد إزالة "${removing?.full_name ?? '—'}" من الشقة؟ يمكن إعادة ربطه لاحقاً.`}
            </DialogDescription>
          </DialogHeader>

          {removing?.is_voting_representative && (
            <div className="space-y-2">
              <label htmlFor="replacement" className="text-sm font-medium">
                الممثل البديل
              </label>
              {otherActiveMembers.length > 0 ? (
                <Select value={replacementId} onValueChange={setReplacementId}>
                  <SelectTrigger id="replacement">
                    <SelectValue placeholder="اختر عضواً" />
                  </SelectTrigger>
                  <SelectContent>
                    {otherActiveMembers.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.full_name ?? '—'} · {relationLabel(m.relation_type)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-destructive">
                  لا يوجد عضو آخر في الشقة. أضف عضواً جديداً أولاً.
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={isPending}>
                إلغاء
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleRemove}
              loading={isPending}
              disabled={
                isPending ||
                (removing?.is_voting_representative === true &&
                  (!replacementId || otherActiveMembers.length === 0))
              }
            >
              إزالة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
