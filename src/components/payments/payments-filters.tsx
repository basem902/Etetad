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
  apartments?: { id: string; number: string }[]
  showApartmentFilter?: boolean
}

export function PaymentsFilters({ apartments = [], showApartmentFilter = true }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const status = params.get('status') ?? 'all'
  const method = params.get('method') ?? 'all'
  const apartment = params.get('apartment') ?? 'all'
  const month = params.get('month') ?? ''

  function update(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(next)) {
      if (!v || v === 'all' || v === '') sp.delete(k)
      else sp.set(k, v)
    }
    sp.delete('page') // any filter change resets to page 1
    startTransition(() => {
      const qs = sp.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname)
    })
  }

  const hasFilters =
    status !== 'all' || method !== 'all' || apartment !== 'all' || month !== ''

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
            <SelectItem value="pending">بانتظار المراجعة</SelectItem>
            <SelectItem value="approved">معتمدة</SelectItem>
            <SelectItem value="rejected">مرفوضة</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-method">طريقة الدفع</Label>
        <Select value={method} onValueChange={(v) => update({ method: v })}>
          <SelectTrigger id="filter-method" className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="cash">نقد</SelectItem>
            <SelectItem value="bank_transfer">تحويل بنكي</SelectItem>
            <SelectItem value="online">تحويل أونلاين</SelectItem>
            <SelectItem value="cheque">شيك</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {showApartmentFilter && apartments.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="filter-apartment">الشقة</Label>
          <Select value={apartment} onValueChange={(v) => update({ apartment: v })}>
            <SelectTrigger id="filter-apartment" className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              {apartments.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  شقة {a.number}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="filter-month">الشهر</Label>
        <Input
          id="filter-month"
          type="month"
          className="w-[160px]"
          value={month}
          onChange={(e) => update({ month: e.target.value })}
        />
      </div>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            update({ status: null, method: null, apartment: null, month: null })
          }
        >
          <X className="h-4 w-4" />
          مسح
        </Button>
      )}
    </div>
  )
}
