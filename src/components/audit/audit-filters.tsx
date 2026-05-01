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

const ENTITY_LABELS: Record<string, string> = {
  payments: 'المدفوعات',
  expenses: 'المصروفات',
  vendors: 'الموردين',
  maintenance_requests: 'طلبات الصيانة',
  tasks: 'المهام',
  suggestions: 'الاقتراحات',
  votes: 'التصويتات',
  vote_responses: 'الأصوات',
  decisions: 'القرارات',
  documents: 'المستندات',
  apartments: 'الشقق',
  apartment_members: 'أعضاء الشقق',
  building_memberships: 'عضوية العمارة',
}

interface Props {
  entityTypes: string[]
  actors: { id: string; name: string | null }[]
}

export function AuditFilters({ entityTypes, actors }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const entity = params.get('entity') ?? 'all'
  const action = params.get('action') ?? 'all'
  const actor = params.get('actor') ?? 'all'
  const dateFrom = params.get('from') ?? ''
  const dateTo = params.get('to') ?? ''

  function update(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(next)) {
      if (!v || v === 'all' || v === '') sp.delete(k)
      else sp.set(k, v)
    }
    // Reset cursor when filters change
    sp.delete('before')
    startTransition(() => {
      const qs = sp.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname)
    })
  }

  const hasFilters =
    entity !== 'all' ||
    action !== 'all' ||
    actor !== 'all' ||
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
        <Label htmlFor="filter-entity">الجدول</Label>
        <Select value={entity} onValueChange={(v) => update({ entity: v })}>
          <SelectTrigger id="filter-entity" className="w-full sm:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            {entityTypes.map((t) => (
              <SelectItem key={t} value={t}>
                {ENTITY_LABELS[t] ?? t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-action">العملية</Label>
        <Select value={action} onValueChange={(v) => update({ action: v })}>
          <SelectTrigger id="filter-action" className="w-full sm:w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="INSERT">إنشاء</SelectItem>
            <SelectItem value="UPDATE">تعديل</SelectItem>
            <SelectItem value="DELETE">حذف</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {actors.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="filter-actor">المُنفِّذ</Label>
          <Select value={actor} onValueChange={(v) => update({ actor: v })}>
            <SelectTrigger id="filter-actor" className="w-full sm:w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              {actors.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name ?? '— بدون اسم —'}
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
            update({ entity: null, action: null, actor: null, from: null, to: null })
          }
        >
          <X className="h-4 w-4" />
          مسح
        </Button>
      )}
    </div>
  )
}
