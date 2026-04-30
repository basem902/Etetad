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
    <Card className="overflow-hidden">
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
  )
}
