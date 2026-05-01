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

interface Props {
  vendors?: { id: string; name: string }[]
  categories?: string[]
}

export function ExpensesFilters({ vendors = [], categories = [] }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const status = params.get('status') ?? 'all'
  const category = params.get('category') ?? 'all'
  const vendor = params.get('vendor') ?? 'all'
  const dateFrom = params.get('from') ?? ''
  const dateTo = params.get('to') ?? ''

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
    category !== 'all' ||
    vendor !== 'all' ||
    dateFrom !== '' ||
    dateTo !== ''

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
          <SelectTrigger id="filter-status" className="w-full sm:w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="draft">مسودة</SelectItem>
            <SelectItem value="pending_review">بانتظار المراجعة</SelectItem>
            <SelectItem value="approved">معتمد</SelectItem>
            <SelectItem value="rejected">مرفوض</SelectItem>
            <SelectItem value="paid">مدفوع</SelectItem>
            <SelectItem value="cancelled">ملغى</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {categories.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="filter-category">التصنيف</Label>
          <Select value={category} onValueChange={(v) => update({ category: v })}>
            <SelectTrigger id="filter-category" className="w-full sm:w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {vendors.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="filter-vendor">المورد</Label>
          <Select value={vendor} onValueChange={(v) => update({ vendor: v })}>
            <SelectTrigger id="filter-vendor" className="w-full sm:w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              {vendors.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="filter-from">من تاريخ</Label>
        <Input
          id="filter-from"
          type="date"
          className="w-full sm:w-[150px]"
          value={dateFrom}
          onChange={(e) => update({ from: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-to">إلى تاريخ</Label>
        <Input
          id="filter-to"
          type="date"
          className="w-full sm:w-[150px]"
          value={dateTo}
          onChange={(e) => update({ to: e.target.value })}
        />
      </div>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            update({ status: null, category: null, vendor: null, from: null, to: null })
          }
        >
          <X className="h-4 w-4" />
          مسح
        </Button>
      )}
    </div>
  )
}
