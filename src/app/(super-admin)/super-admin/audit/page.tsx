import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/shared/page-header'
import { DiffViewer } from '@/components/audit/diff-viewer'
import { listPlatformAudit } from '@/lib/queries/super-admin'
import { formatDateTime } from '@/lib/format'

export const metadata: Metadata = {
  title: 'سجل المنصة · Super Admin',
}

const ACTION_CFG: Record<
  string,
  { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' }
> = {
  INSERT: { label: 'إنشاء', variant: 'success' },
  UPDATE: { label: 'تعديل', variant: 'warning' },
  DELETE: { label: 'حذف', variant: 'destructive' },
}

function single(
  sp: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const v = sp[key]
  return Array.isArray(v) ? v[0] : v
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

export default async function SuperAdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const entity = single(sp, 'entity')
  const buildingId = single(sp, 'building')
  const before = single(sp, 'before')

  const { rows, nextCursor } = await listPlatformAudit({
    entityType: entity,
    buildingId,
    before,
    pageSize: 50,
  })

  const cleanedSearch: Record<string, string | undefined> = {
    entity: typeof entity === 'string' ? entity : undefined,
    building: typeof buildingId === 'string' ? buildingId : undefined,
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="سجل المنصة"
        description="كل التغييرات الحساسة على كل العمارات. يحوي تعديلات الاشتراكات والصلاحيات والمدفوعات."
      />

      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            لا توجد سجلات.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <Card className="overflow-hidden">
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full min-w-[1000px] text-sm">
                <thead className="bg-muted/40 text-muted-foreground text-xs">
                  <tr>
                    <th className="h-10 px-3 text-right font-medium whitespace-nowrap">الوقت</th>
                    <th className="h-10 px-3 text-right font-medium">العمارة</th>
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
                          {r.building_id ? (
                            <Link
                              href={`/super-admin/buildings/${r.building_id}`}
                              className="text-xs hover:underline"
                            >
                              {r.building_name ?? r.building_id.slice(0, 8)}
                            </Link>
                          ) : (
                            <span className="text-xs text-muted-foreground">— عام —</span>
                          )}
                        </td>
                        <td className="h-12 px-3 align-top">
                          <Badge variant={cfg.variant}>{cfg.label}</Badge>
                        </td>
                        <td className="h-12 px-3 align-top text-xs">
                          <span className="font-mono text-muted-foreground">
                            {r.entity_type}
                          </span>
                          {r.entity_id && (
                            <div className="text-[10px] text-muted-foreground/70 font-mono">
                              {r.entity_id.slice(0, 8)}
                            </div>
                          )}
                        </td>
                        <td className="h-12 px-3 align-top text-sm">
                          {r.actor_name ?? (
                            <span className="text-muted-foreground">— نظام —</span>
                          )}
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
              {rows.length} سجل في هذه الصفحة (الحد 50)
            </span>
            {nextCursor && (
              <Button asChild variant="outline" size="sm">
                <Link
                  href={buildHref('/super-admin/audit', cleanedSearch, {
                    before: nextCursor,
                  })}
                >
                  السجلات الأقدم
                  <ChevronLeft className="h-4 w-4" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
