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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export function ApartmentsFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const status = params.get('status') ?? 'all'
  const occupancy = params.get('occupancy') ?? 'all'
  const floor = params.get('floor') ?? ''

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

  const hasFilters = status !== 'all' || occupancy !== 'all' || floor !== ''

  return (
    <div
      className={cn('flex flex-wrap items-end gap-3 p-3 rounded-md border border-border bg-card/50', isPending && 'opacity-70')}
      aria-busy={isPending}
    >
      <div className="space-y-1.5">
        <Label htmlFor="filter-status">الحالة</Label>
        <Select
          value={status}
          onValueChange={(v) => update({ status: v === 'all' ? null : v })}
        >
          <SelectTrigger id="filter-status" className="w-full sm:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="occupied">مأهولة</SelectItem>
            <SelectItem value="vacant">شاغرة</SelectItem>
            <SelectItem value="under_maintenance">قيد الصيانة</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-occupancy">السكان</Label>
        <Select
          value={occupancy}
          onValueChange={(v) => update({ occupancy: v === 'all' ? null : v })}
        >
          <SelectTrigger id="filter-occupancy" className="w-full sm:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="with">لها سكان</SelectItem>
            <SelectItem value="without">بدون سكان</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-floor">الطابق</Label>
        <Input
          id="filter-floor"
          type="number"
          inputMode="numeric"
          className="w-full sm:w-[120px]"
          value={floor}
          onChange={(e) => update({ floor: e.target.value })}
          placeholder="مثلاً 2"
        />
      </div>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => update({ status: null, occupancy: null, floor: null })}
        >
          <X className="h-4 w-4" />
          مسح الفلاتر
        </Button>
      )}
    </div>
  )
}
