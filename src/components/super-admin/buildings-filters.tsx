'use client'

import { useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

// =============================================
// Buildings filters (super-admin)
// =============================================
// Mirrors the apartments-filters pattern: URL-driven, server-side filtering.
// `q` is debounce-free on purpose — Phase 14 dataset is small (one row per
// building), so an immediate replace is fine and avoids stale state.
// =============================================
export function BuildingsFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const status = params.get('status') ?? 'all'
  const plan = params.get('plan') ?? 'all'
  const q = params.get('q') ?? ''

  function update(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(next)) {
      if (!v || v === 'all' || v === '') sp.delete(k)
      else sp.set(k, v)
    }
    startTransition(() => {
      const qs = sp.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname)
    })
  }

  const hasFilters = status !== 'all' || plan !== 'all' || q !== ''

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
        <Select
          value={status}
          onValueChange={(v) => update({ status: v === 'all' ? null : v })}
        >
          <SelectTrigger id="filter-status" className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="trial">تجربة</SelectItem>
            <SelectItem value="active">نشطة</SelectItem>
            <SelectItem value="past_due">متأخّرة</SelectItem>
            <SelectItem value="cancelled">ملغاة</SelectItem>
            <SelectItem value="expired">منتهية</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-plan">الخطة</Label>
        <Select
          value={plan}
          onValueChange={(v) => update({ plan: v === 'all' ? null : v })}
        >
          <SelectTrigger id="filter-plan" className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="trial">تجربة</SelectItem>
            <SelectItem value="basic">أساسية</SelectItem>
            <SelectItem value="pro">احترافية</SelectItem>
            <SelectItem value="enterprise">مؤسسات</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-q">بحث بالاسم</Label>
        <Input
          id="filter-q"
          type="search"
          className="w-[220px]"
          value={q}
          onChange={(e) => update({ q: e.target.value })}
          placeholder="مثلاً: عمارة الرياض"
        />
      </div>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => update({ status: null, plan: null, q: null })}
        >
          <X className="h-4 w-4" />
          مسح الفلاتر
        </Button>
      )}
    </div>
  )
}
