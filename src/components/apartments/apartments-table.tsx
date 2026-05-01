import Link from 'next/link'
import { ChevronLeft, Crown } from 'lucide-react'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'
import {
  ApartmentStatusBadge,
} from '@/components/apartments/apartment-status-badge'
import { formatCurrency, formatDate } from '@/lib/format'
import type { ApartmentRow } from '@/lib/queries/apartments'

interface Props {
  rows: ApartmentRow[]
}

export function ApartmentsTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="لا توجد شقق مطابقة"
        description="أضف شقة جديدة، أو غيّر الفلاتر."
      />
    )
  }

  return (
    <>
      {/* Mobile: card stack */}
      <div className="md:hidden space-y-3">
        {rows.map((apt) => (
          <Link
            key={apt.id}
            href={`/apartments/${apt.id}`}
            className="block"
          >
            <Card className="hover:bg-muted/30 transition-colors">
              <CardContent className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-base">شقة {apt.number}</span>
                    {apt.floor != null && (
                      <span className="text-xs text-muted-foreground">
                        دور {apt.floor}
                      </span>
                    )}
                  </div>
                  <ApartmentStatusBadge status={apt.status} />
                </div>

                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">الرسوم الشَهرية</span>
                  <span className="tabular-nums font-medium">
                    {formatCurrency(apt.monthly_fee)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">السكان</span>
                  <Badge
                    variant={apt.member_count > 0 ? 'default' : 'secondary'}
                  >
                    {apt.member_count}
                  </Badge>
                </div>

                {apt.voting_rep && (
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground inline-flex items-center gap-1">
                      <Crown
                        className="h-3.5 w-3.5 text-warning"
                        aria-label="ممثل التصويت"
                      />
                      ممثل
                    </span>
                    <span className="truncate max-w-[60%]">
                      {apt.voting_rep.full_name ?? '—'}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border">
                  <span>آخر تعديل: {formatDate(apt.updated_at)}</span>
                  <span className="inline-flex items-center gap-1 text-foreground">
                    التفاصيل
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Desktop: table */}
      <Card className="overflow-hidden hidden md:block">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="h-10 px-3 text-right font-medium align-middle">رقم</th>
                <th className="h-10 px-3 text-right font-medium align-middle">الطابق</th>
                <th className="h-10 px-3 text-right font-medium align-middle">الرسوم</th>
                <th className="h-10 px-3 text-right font-medium align-middle">الحالة</th>
                <th className="h-10 px-3 text-right font-medium align-middle">السكان</th>
                <th className="h-10 px-3 text-right font-medium align-middle">ممثل التصويت</th>
                <th className="h-10 px-3 text-right font-medium align-middle">آخر تعديل</th>
                <th className="h-10 px-3 text-right font-medium align-middle">
                  <span className="sr-only">إجراءات</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((apt) => (
                <tr
                  key={apt.id}
                  className="border-t border-border hover:bg-muted/30 transition-colors"
                >
                  <td className="h-12 px-3 align-middle font-medium">
                    <Link
                      href={`/apartments/${apt.id}`}
                      className="hover:underline"
                    >
                      {apt.number}
                    </Link>
                  </td>
                  <td className="h-12 px-3 align-middle">{apt.floor ?? '—'}</td>
                  <td className="h-12 px-3 align-middle tabular-nums">
                    {formatCurrency(apt.monthly_fee)}
                  </td>
                  <td className="h-12 px-3 align-middle">
                    <ApartmentStatusBadge status={apt.status} />
                  </td>
                  <td className="h-12 px-3 align-middle">
                    <Badge variant={apt.member_count > 0 ? 'default' : 'secondary'}>
                      {apt.member_count}
                    </Badge>
                  </td>
                  <td className="h-12 px-3 align-middle">
                    {apt.voting_rep ? (
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <Crown
                          className="h-3.5 w-3.5 text-warning"
                          aria-label="ممثل التصويت"
                        />
                        <span className="truncate max-w-[160px]">
                          {apt.voting_rep.full_name ?? '—'}
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">لا يوجد</span>
                    )}
                  </td>
                  <td className="h-12 px-3 align-middle text-xs text-muted-foreground">
                    {formatDate(apt.updated_at)}
                  </td>
                  <td className="h-12 px-3 align-middle">
                    <Link
                      href={`/apartments/${apt.id}`}
                      className="inline-flex items-center gap-1 text-xs text-foreground hover:underline"
                    >
                      التفاصيل
                      <ChevronLeft className="h-3.5 w-3.5 lucide-chevron-left" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  )
}
