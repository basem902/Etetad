import type { Metadata } from 'next'
import { ShieldCheck, Users } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { listAllUsers } from '@/lib/queries/super-admin'
import { formatDate } from '@/lib/format'

export const metadata: Metadata = {
  title: 'المستخدمون · Super Admin',
}

function single(
  sp: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const v = sp[key]
  return Array.isArray(v) ? v[0] : v
}

export default async function SuperAdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const q = single(sp, 'q')

  const users = await listAllUsers({ q })

  return (
    <div className="space-y-6">
      <PageHeader
        title="المستخدمون"
        description={`إجمالي ${users.length} مستخدم على المنصة.`}
      />

      {/* Server-rendered search using GET form (no client needed). */}
      <form className="flex items-end gap-2 p-3 rounded-md border border-border bg-card/50">
        <div className="space-y-1.5 flex-1 max-w-xs">
          <Label htmlFor="q">بحث بالاسم</Label>
          <Input
            id="q"
            name="q"
            type="search"
            defaultValue={q ?? ''}
            placeholder="مثلاً: باسم"
          />
        </div>
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground h-10 px-4 text-sm font-medium hover:bg-primary/80"
        >
          بحث
        </button>
      </form>

      {users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="لا يوجد مستخدمون مطابقون"
          description="جرّب بحثاً آخر."
        />
      ) : (
        <>
          {/* Mobile: card stack */}
          <div className="md:hidden space-y-3">
            {users.map((u) => (
              <Card key={u.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">
                        {u.full_name ?? (
                          <span className="text-muted-foreground">— بدون اسم —</span>
                        )}
                      </div>
                      {u.phone && (
                        <div
                          className="text-xs text-muted-foreground truncate"
                          dir="ltr"
                        >
                          {u.phone}
                        </div>
                      )}
                    </div>
                    {u.is_super_admin && (
                      <span className="inline-flex items-center gap-1 text-xs text-primary shrink-0">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        super_admin
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border">
                    <span className="inline-flex items-center gap-1.5">
                      <Badge
                        variant={u.buildings_count > 0 ? 'default' : 'secondary'}
                      >
                        {u.buildings_count}
                      </Badge>
                      عمارات
                    </span>
                    <span>انضَم {formatDate(u.created_at)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Desktop: table */}
          <Card className="overflow-hidden hidden md:block">
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="h-10 px-3 text-right font-medium align-middle">الاسم</th>
                  <th className="h-10 px-3 text-right font-medium align-middle">رقم الجوال</th>
                  <th className="h-10 px-3 text-right font-medium align-middle">عمارات</th>
                  <th className="h-10 px-3 text-right font-medium align-middle">صلاحيات</th>
                  <th className="h-10 px-3 text-right font-medium align-middle">انضمام</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className="border-t border-border hover:bg-muted/30 transition-colors"
                  >
                    <td className="h-12 px-3 align-middle font-medium">
                      {u.full_name ?? <span className="text-muted-foreground">— بدون اسم —</span>}
                    </td>
                    <td className="h-12 px-3 align-middle text-xs text-muted-foreground">
                      {u.phone ?? '—'}
                    </td>
                    <td className="h-12 px-3 align-middle">
                      <Badge variant={u.buildings_count > 0 ? 'default' : 'secondary'}>
                        {u.buildings_count}
                      </Badge>
                    </td>
                    <td className="h-12 px-3 align-middle">
                      {u.is_super_admin ? (
                        <span className="inline-flex items-center gap-1 text-xs text-primary">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          super_admin
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">عادي</span>
                      )}
                    </td>
                    <td className="h-12 px-3 align-middle text-xs text-muted-foreground">
                      {formatDate(u.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
        </>
      )}
    </div>
  )
}
