import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronLeft } from 'lucide-react'
import { EntityLink } from './entity-link'
import { DiffViewer } from './diff-viewer'
import { formatDateTime } from '@/lib/format'
import type { AuditEntry } from '@/lib/queries/audit'

const ACTION_CFG: Record<
  string,
  { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' }
> = {
  INSERT: { label: 'إنشاء', variant: 'success' },
  UPDATE: { label: 'تعديل', variant: 'warning' },
  DELETE: { label: 'حذف', variant: 'destructive' },
}

interface Props {
  rows: AuditEntry[]
  nextCursor: string | null
  pageSize: number
  /** Used to build the next-page link (current URL search). */
  searchParams: Record<string, string | undefined>
  baseHref?: string
}

function buildHref(
  basePath: string,
  searchParams: Record<string, string | undefined>,
  overrides: Record<string, string>,
): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams)) {
    if (v && k !== 'before') sp.set(k, v)
  }
  for (const [k, v] of Object.entries(overrides)) sp.set(k, v)
  const qs = sp.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

export function AuditTable({
  rows,
  nextCursor,
  pageSize,
  searchParams,
  baseHref = '/audit-logs',
}: Props) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          لا توجد سجلات تطابق الفلاتر.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <Card className="overflow-hidden">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted/40 text-muted-foreground text-xs">
              <tr>
                <th className="h-10 px-3 text-right font-medium whitespace-nowrap">الوقت</th>
                <th className="h-10 px-3 text-right font-medium">العملية</th>
                <th className="h-10 px-3 text-right font-medium">العنصر</th>
                <th className="h-10 px-3 text-right font-medium">المُنفِّذ</th>
                <th className="h-10 px-3 text-right font-medium">التغييرات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const cfg = ACTION_CFG[r.action] ?? {
                  label: r.action,
                  variant: 'secondary' as const,
                }
                return (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="h-12 px-3 align-top whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTime(r.created_at)}
                    </td>
                    <td className="h-12 px-3 align-top">
                      <Badge variant={cfg.variant}>{cfg.label}</Badge>
                    </td>
                    <td className="h-12 px-3 align-top">
                      <EntityLink entityType={r.entity_type} entityId={r.entity_id} />
                    </td>
                    <td className="h-12 px-3 align-top text-sm">
                      {r.actor_name ?? <span className="text-muted-foreground">— نظام —</span>}
                    </td>
                    <td className="px-3 py-2 align-top max-w-[420px]">
                      <DiffViewer
                        oldValues={r.old_values}
                        newValues={r.new_values}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {rows.length} سجل في هذه الصفحة (الحد {pageSize})
        </span>
        {nextCursor && (
          <Button asChild variant="outline" size="sm">
            <Link href={buildHref(baseHref, searchParams, { before: nextCursor })}>
              السجلات الأقدم
              <ChevronLeft className="h-4 w-4 lucide-chevron-left" />
            </Link>
          </Button>
        )}
      </div>
    </div>
  )
}
