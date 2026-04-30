'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmptyState } from '@/components/shared/empty-state'
import { formatRelative, formatDateTime } from '@/lib/format'
import {
  approvePendingMemberAction,
  rejectPendingMemberAction,
} from '@/actions/joins'
import type { ApartmentRelation, Tables } from '@/types/database'

type PendingRow = Tables<'pending_apartment_members'>
type ApartmentRef = { id: string; number: string; floor: number | null }

interface Props {
  rows: PendingRow[]
  apartments: ApartmentRef[]
}

export function PendingMembersList({ rows, apartments }: Props) {
  const router = useRouter()
  const [approveOpen, setApproveOpen] = useState<string | null>(null)
  const [rejectOpen, setRejectOpen] = useState<string | null>(null)
  const [apartmentId, setApartmentId] = useState<string>('')
  const [relation, setRelation] = useState<ApartmentRelation>('resident')
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()

  const approveRow = rows.find((r) => r.id === approveOpen) ?? null
  const rejectRow = rows.find((r) => r.id === rejectOpen) ?? null

  function openApprove(row: PendingRow) {
    // Try to auto-select apartment by requested number (helpful UX)
    const matched = row.requested_apartment_number
      ? apartments.find((a) => a.number === row.requested_apartment_number)
      : null
    setApartmentId(matched?.id ?? '')
    setRelation('resident')
    setApproveOpen(row.id)
  }

  function openReject(row: PendingRow) {
    setReason('')
    setRejectOpen(row.id)
  }

  function handleApprove() {
    if (!approveRow) return
    if (!apartmentId) {
      toast.error('اختر شقة أولاً.')
      return
    }
    const fd = new FormData()
    fd.set('pending_id', approveRow.id)
    fd.set('apartment_id', apartmentId)
    fd.set('relation_type', relation)
    startTransition(async () => {
      const result = await approvePendingMemberAction(fd)
      if (result.success) {
        toast.success(result.message ?? 'تم الاعتماد.')
        setApproveOpen(null)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleReject() {
    if (!rejectRow) return
    if (reason.trim().length < 3) {
      toast.error('سبب الرفض مَطلوب (3 أحرف على الأقل).')
      return
    }
    const fd = new FormData()
    fd.set('pending_id', rejectRow.id)
    fd.set('reason', reason.trim())
    startTransition(async () => {
      const result = await rejectPendingMemberAction(fd)
      if (result.success) {
        toast.success(result.message ?? 'تم الرفض.')
        setRejectOpen(null)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="لا توجد طلبات معلَّقة"
        description="عندما يَستخدم ساكن جديد رابط الانضمام، سيَظهر طلبه هنا."
      />
    )
  }

  return (
    <>
      <Card className="overflow-hidden">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="h-10 px-3 text-right font-medium align-middle">الاسم</th>
                <th className="h-10 px-3 text-right font-medium align-middle">رقم الشقة المُدَّعى</th>
                <th className="h-10 px-3 text-right font-medium align-middle">الجوال</th>
                <th className="h-10 px-3 text-right font-medium align-middle">منذ</th>
                <th className="h-10 px-3 text-right font-medium align-middle">
                  <span className="sr-only">إجراءات</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-border hover:bg-muted/30 transition-colors"
                >
                  <td className="h-12 px-3 align-middle font-medium">
                    {row.full_name ?? '—'}
                  </td>
                  <td className="h-12 px-3 align-middle">
                    {row.requested_apartment_number ? (
                      <Badge variant="outline">{row.requested_apartment_number}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">لم يُدخِله</span>
                    )}
                  </td>
                  <td className="h-12 px-3 align-middle" dir="ltr">
                    {row.phone ? (
                      <a href={`tel:${row.phone}`} className="hover:underline">
                        {row.phone}
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="h-12 px-3 align-middle text-xs text-muted-foreground">
                    <span title={formatDateTime(row.created_at)}>
                      {formatRelative(row.created_at)}
                    </span>
                  </td>
                  <td className="h-12 px-3 align-middle">
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => openApprove(row)}>
                        <CheckCircle2 className="h-4 w-4" />
                        موافقة
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => openReject(row)}
                      >
                        <XCircle className="h-4 w-4" />
                        رفض
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Approve dialog */}
      <Dialog
        open={!!approveOpen}
        onOpenChange={(o) => !o && setApproveOpen(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>اعتماد طلب — {approveRow?.full_name ?? ''}</DialogTitle>
            <DialogDescription>
              اختر الشقة التي تَنتمي للساكن + نوع علاقته.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="apartment_id">الشقة</Label>
              <Select value={apartmentId} onValueChange={setApartmentId}>
                <SelectTrigger id="apartment_id">
                  <SelectValue placeholder="اختر شقة" />
                </SelectTrigger>
                <SelectContent>
                  {apartments.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      شقة {a.number}
                      {a.floor !== null ? ` — الطابق ${a.floor}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {approveRow?.requested_apartment_number && (
                <p className="text-xs text-muted-foreground mt-1">
                  أَدخل الساكن: شقة {approveRow.requested_apartment_number}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="relation_type">العلاقة</Label>
              <Select
                value={relation}
                onValueChange={(v) => setRelation(v as ApartmentRelation)}
              >
                <SelectTrigger id="relation_type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">مالك</SelectItem>
                  <SelectItem value="resident">مستأجر</SelectItem>
                  <SelectItem value="representative">ممثل مفوّض</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={isPending}>
                إلغاء
              </Button>
            </DialogClose>
            <Button onClick={handleApprove} loading={isPending} disabled={!apartmentId}>
              اعتماد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog
        open={!!rejectOpen}
        onOpenChange={(o) => !o && setRejectOpen(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>رفض طلب — {rejectRow?.full_name ?? ''}</DialogTitle>
            <DialogDescription>
              سَيَستلم الساكن بريداً بسبب الرفض. كن واضحاً ولطيفاً.
            </DialogDescription>
          </DialogHeader>

          <div>
            <Label htmlFor="reason">سبب الرفض</Label>
            <Textarea
              id="reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={3}
              maxLength={500}
              placeholder="مثلاً: لا أعرف هذا الشخص، يَرجى التحقق من الرابط مع المالك."
              disabled={isPending}
            />
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={isPending}>
                إلغاء
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleReject}
              loading={isPending}
              disabled={reason.trim().length < 3}
            >
              تأكيد الرفض
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
