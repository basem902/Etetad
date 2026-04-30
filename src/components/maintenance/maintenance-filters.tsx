'use client'

import { useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface Props {
  technicians?: { user_id: string; full_name: string | null }[]
  showAssigneeFilter?: boolean
}

export function MaintenanceFilters({
  technicians = [],
  showAssigneeFilter = true,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const status = params.get('status') ?? 'all'
  const priority = params.get('priority') ?? 'all'
  const location = params.get('location') ?? 'all'
  const assignee = params.get('assignee') ?? 'all'

  function update(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(next)) {
      if (!v || v === 'all' || v === '') sp.delete(k)
      else sp.set(k, v)
    }
    sp.delete('page')
    startTransition(() => {
      const qs = sp.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname)
    })
  }

  const hasFilters =
    status !== 'all' ||
    priority !== 'all' ||
    location !== 'all' ||
    assignee !== 'all'

  return (
    <div
      className={cn(
        'flex flex-wrap items-end gap-3 p-3 rounded-md border border-border bg-card/50',
        isPending && 'opacity-70',
      )}
      aria-busy={isPending}
    >
      <div className="space-y-1.5">
        <Label htmlFor="filter-status">الحالة</Label>
        <Select value={status} onValueChange={(v) => update({ status: v })}>
          <SelectTrigger id="filter-status" className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="new">جديد</SelectItem>
            <SelectItem value="reviewing">قيد المراجعة</SelectItem>
            <SelectItem value="waiting_quote">بانتظار عرض</SelectItem>
            <SelectItem value="waiting_approval">بانتظار الاعتماد</SelectItem>
            <SelectItem value="in_progress">قيد التنفيذ</SelectItem>
            <SelectItem value="completed">مكتمل</SelectItem>
            <SelectItem value="rejected">مرفوض</SelectItem>
            <SelectItem value="reopened">أُعيد فتحه</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-priority">الأولوية</Label>
        <Select value={priority} onValueChange={(v) => update({ priority: v })}>
          <SelectTrigger id="filter-priority" className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="urgent">عاجلة</SelectItem>
            <SelectItem value="high">عالية</SelectItem>
            <SelectItem value="medium">متوسطة</SelectItem>
            <SelectItem value="low">منخفضة</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-location">الموقع</Label>
        <Select value={location} onValueChange={(v) => update({ location: v })}>
          <SelectTrigger id="filter-location" className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="apartment">داخل شقة</SelectItem>
            <SelectItem value="entrance">المدخل</SelectItem>
            <SelectItem value="elevator">المصعد</SelectItem>
            <SelectItem value="roof">السطح</SelectItem>
            <SelectItem value="parking">الموقف</SelectItem>
            <SelectItem value="other">أخرى</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {showAssigneeFilter && technicians.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="filter-assignee">الفني</Label>
          <Select value={assignee} onValueChange={(v) => update({ assignee: v })}>
            <SelectTrigger id="filter-assignee" className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              {technicians.map((t) => (
                <SelectItem key={t.user_id} value={t.user_id}>
                  {t.full_name ?? '—'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            update({ status: null, priority: null, location: null, assignee: null })
          }
        >
          <X className="h-4 w-4" />
          مسح
        </Button>
      )}
    </div>
  )
}
