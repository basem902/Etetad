'use client'

import { useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'
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
import { EmptyState } from '@/components/shared/empty-state'
import { DocumentCard } from './document-card'
import { cn } from '@/lib/utils'
import type { DocumentRow } from '@/lib/queries/documents'

interface Props {
  documents: DocumentRow[]
  categories: string[]
  canManage: boolean
}

export function DocumentsGrid({ documents, categories, canManage }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const category = params.get('category') ?? 'all'
  const q = params.get('q') ?? ''

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

  const hasFilters = category !== 'all' || q !== ''

  return (
    <div className="space-y-4">
      <div
        className={cn(
          'flex flex-wrap items-end gap-3 p-3 rounded-md border border-border bg-card/50',
          isPending && 'opacity-70',
        )}
        aria-busy={isPending}
      >
        <div className="space-y-1.5 flex-1 min-w-full sm:w-[180px]">
          <Label htmlFor="filter-q">بحث</Label>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="filter-q"
              type="search"
              defaultValue={q}
              onChange={(e) => update({ q: e.target.value })}
              placeholder="ابحث في عناوين المستندات..."
              className="ps-3 pe-9"
            />
          </div>
        </div>

        {categories.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="filter-category">التصنيف</Label>
            <Select value={category} onValueChange={(v) => update({ category: v })}>
              <SelectTrigger id="filter-category" className="w-full sm:w-[180px]">
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

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => update({ category: null, q: null })}
          >
            <X className="h-4 w-4" />
            مسح
          </Button>
        )}
      </div>

      {documents.length === 0 ? (
        <EmptyState
          title="لا توجد مستندات"
          description="ارفع أول مستند لقاعدة بيانات العمارة."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((d) => (
            <DocumentCard key={d.id} document={d} canManage={canManage} />
          ))}
        </div>
      )}
    </div>
  )
}
