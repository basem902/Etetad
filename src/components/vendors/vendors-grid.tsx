'use client'

import { useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmptyState } from '@/components/shared/empty-state'
import { VendorCard } from './vendor-card'
import { cn } from '@/lib/utils'
import type { VendorRow } from '@/lib/queries/vendors'

interface Props {
  vendors: VendorRow[]
  specialties: string[]
}

export function VendorsGrid({ vendors, specialties }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const specialty = params.get('specialty') ?? 'all'
  const includeInactive = params.get('inactive') === '1'

  function update(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(next)) {
      if (!v || v === 'all') sp.delete(k)
      else sp.set(k, v)
    }
    startTransition(() => {
      const qs = sp.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname)
    })
  }

  const hasFilters = specialty !== 'all' || includeInactive

  return (
    <div className="space-y-4">
      <div
        className={cn(
          'flex flex-wrap items-end gap-3 p-3 rounded-md border border-border bg-card/50',
          isPending && 'opacity-70',
        )}
        aria-busy={isPending}
      >
        {specialties.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="filter-specialty">التخصص</Label>
            <Select
              value={specialty}
              onValueChange={(v) => update({ specialty: v })}
            >
              <SelectTrigger id="filter-specialty" className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {specialties.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex items-center gap-2 pb-1">
          <input
            id="filter-inactive"
            type="checkbox"
            className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
            checked={includeInactive}
            onChange={(e) =>
              update({ inactive: e.target.checked ? '1' : null })
            }
          />
          <Label htmlFor="filter-inactive" className="cursor-pointer">
            عرض المؤرشفين
          </Label>
        </div>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => update({ specialty: null, inactive: null })}
          >
            <X className="h-4 w-4" />
            مسح
          </Button>
        )}
      </div>

      {vendors.length === 0 ? (
        <EmptyState
          title="لا يوجد موردون"
          description="جرّب تغيير الفلاتر، أو أضف مورداً جديداً."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {vendors.map((v) => (
            <VendorCard key={v.id} vendor={v} />
          ))}
        </div>
      )}
    </div>
  )
}
