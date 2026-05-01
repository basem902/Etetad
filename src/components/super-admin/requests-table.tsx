'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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
import { formatDateTime, formatRelative } from '@/lib/format'
import { updateSubscriptionRequestStatusAction } from '@/actions/marketing'
import type { SubscriptionRequestStatus, Tables } from '@/types/database'

type RequestRow = Tables<'subscription_requests'>

interface Props {
  rows: RequestRow[]
}

const statusLabels: Record<SubscriptionRequestStatus, string> = {
  new: 'جديد',
  contacted: 'تم التواصل',
  qualified: 'مُؤهَّل',
  closed_won: 'تم الاشتراك',
  closed_lost: 'لم يُكمل',
}

const statusVariants: Record<
  SubscriptionRequestStatus,
  'default' | 'secondary' | 'success' | 'destructive' | 'outline' | 'warning'
> = {
  new: 'default',
  contacted: 'warning',
  qualified: 'secondary',
  closed_won: 'success',
  closed_lost: 'outline',
}

export function RequestsTable({ rows }: Props) {
  const router = useRouter()
  const [openId, setOpenId] = useState<string | null>(null)
  const [status, setStatus] = useState<SubscriptionRequestStatus>('new')
  const [notes, setNotes] = useState('')
  const [isPending, startTransition] = useTransition()

  const open = rows.find((r) => r.id === openId) ?? null

  function openDialog(row: RequestRow) {
    setOpenId(row.id)
    setStatus(row.status as SubscriptionRequestStatus)
    setNotes(row.notes ?? '')
  }

  function handleSave() {
    if (!open) return
    const fd = new FormData()
    fd.set('request_id', open.id)
    fd.set('status', status)
    fd.set('notes', notes.trim())
    startTransition(async () => {
      const result = await updateSubscriptionRequestStatusAction(fd)
      if (result.success) {
        toast.success(result.message ?? 'تم الحفظ')
        setOpenId(null)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="لا توجد طلبات"
        description="عند تَعبئة نموذج /contact، ستَظهر الطلبات هنا."
      />
    )
  }

  return (
    <>
      {/* Mobile: card stack */}
      <div className="md:hidden space-y-3">
        {rows.map((row) => (
          <Card
            key={row.id}
            className="hover:bg-muted/30 transition-colors cursor-pointer"
            onClick={() => openDialog(row)}
          >
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{row.building_name}</div>
                  {row.city && (
                    <div className="text-xs text-muted-foreground truncate">
                      {row.city}
                    </div>
                  )}
                </div>
                <Badge
                  variant={statusVariants[row.status as SubscriptionRequestStatus]}
                >
                  {statusLabels[row.status as SubscriptionRequestStatus]}
                </Badge>
              </div>
              <div className="text-sm">
                <div className="font-medium">{row.full_name}</div>
                <a
                  href={`mailto:${row.email}`}
                  className="text-xs text-muted-foreground hover:underline truncate block"
                  dir="ltr"
                  onClick={(e) => e.stopPropagation()}
                >
                  {row.email}
                </a>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border">
                <span>
                  {row.interested_tier ?? '—'}
                  {row.estimated_apartments ? ` · ${row.estimated_apartments} شقة` : ''}
                </span>
                <span title={formatDateTime(row.created_at)}>
                  {formatRelative(row.created_at)}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full mt-2"
                onClick={(e) => {
                  e.stopPropagation()
                  openDialog(row)
                }}
              >
                مُراجَعة
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Desktop: table */}
      <Card className="overflow-hidden hidden md:block">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="h-10 px-3 text-right font-medium align-middle">العمارة</th>
                <th className="h-10 px-3 text-right font-medium align-middle">المُرسِل</th>
                <th className="h-10 px-3 text-right font-medium align-middle">الباقة</th>
                <th className="h-10 px-3 text-right font-medium align-middle">الشقق</th>
                <th className="h-10 px-3 text-right font-medium align-middle">الحالة</th>
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
                    {row.building_name}
                    {row.city && (
                      <span className="text-xs text-muted-foreground block">
                        {row.city}
                      </span>
                    )}
                  </td>
                  <td className="h-12 px-3 align-middle">
                    <div>{row.full_name}</div>
                    <a
                      href={`mailto:${row.email}`}
                      className="text-xs text-muted-foreground hover:underline"
                      dir="ltr"
                    >
                      {row.email}
                    </a>
                    {row.phone && (
                      <div className="text-xs text-muted-foreground" dir="ltr">
                        {row.phone}
                      </div>
                    )}
                  </td>
                  <td className="h-12 px-3 align-middle">
                    {row.interested_tier ? (
                      <Badge variant="outline">{row.interested_tier}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="h-12 px-3 align-middle tabular-nums">
                    {row.estimated_apartments ?? '—'}
                  </td>
                  <td className="h-12 px-3 align-middle">
                    <Badge variant={statusVariants[row.status as SubscriptionRequestStatus]}>
                      {statusLabels[row.status as SubscriptionRequestStatus]}
                    </Badge>
                  </td>
                  <td className="h-12 px-3 align-middle text-xs text-muted-foreground">
                    <span title={formatDateTime(row.created_at)}>
                      {formatRelative(row.created_at)}
                    </span>
                  </td>
                  <td className="h-12 px-3 align-middle">
                    <Button size="sm" variant="outline" onClick={() => openDialog(row)}>
                      مراجعة
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>مراجعة طلب — {open?.building_name}</DialogTitle>
            <DialogDescription>
              غيِّر الحالة + أَضف ملاحظات داخلية. التَواصل مع العميل خارج النظام.
            </DialogDescription>
          </DialogHeader>

          {open && (
            <div className="space-y-4">
              <div className="space-y-1.5 text-sm">
                <div>
                  <span className="text-muted-foreground">المُرسِل:</span>{' '}
                  <span>{open.full_name}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">البريد:</span>{' '}
                  <a
                    href={`mailto:${open.email}`}
                    className="hover:underline"
                    dir="ltr"
                  >
                    {open.email}
                  </a>
                </div>
                {open.phone && (
                  <div>
                    <span className="text-muted-foreground">الجوال:</span>{' '}
                    <a
                      href={`tel:${open.phone}`}
                      className="hover:underline"
                      dir="ltr"
                    >
                      {open.phone}
                    </a>
                  </div>
                )}
                {open.message && (
                  <div className="pt-2 border-t border-border mt-2">
                    <div className="text-muted-foreground mb-1">الرسالة:</div>
                    <div className="whitespace-pre-wrap">{open.message}</div>
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="status">الحالة</Label>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as SubscriptionRequestStatus)}
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      ['new', 'contacted', 'qualified', 'closed_won', 'closed_lost'] as const
                    ).map((s) => (
                      <SelectItem key={s} value={s}>
                        {statusLabels[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="notes">ملاحظات داخلية</Label>
                <Textarea
                  id="notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={4000}
                  placeholder="ملاحظات خاصة بـ super_admin (لا يَراها العميل)"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={isPending}>
                إلغاء
              </Button>
            </DialogClose>
            <Button onClick={handleSave} loading={isPending}>
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
