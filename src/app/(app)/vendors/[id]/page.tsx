import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronRight, Phone, Tag, Archive } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId, getUserBuildings } from '@/lib/tenant'
import { hasRole, isSuperAdmin } from '@/lib/permissions'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/shared/page-header'
import { ExpenseStatusBadge } from '@/components/dashboard/status-badges'
import { RatingStars } from '@/components/vendors/rating-stars'
import { VendorActions } from '@/components/vendors/vendor-actions'
import {
  getVendorWithStats,
  listVendorExpenses,
} from '@/lib/queries/vendors'
import { formatCurrency, formatDate } from '@/lib/format'

export const metadata: Metadata = {
  title: 'تفاصيل المورد · نظام إدارة العمارة',
}

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const buildings = await getUserBuildings(user.id)
  if (buildings.length === 0) redirect('/onboarding')

  const buildingId = (await getActiveBuildingId()) ?? buildings[0]?.building_id
  if (!buildingId) redirect('/onboarding')

  const vendor = await getVendorWithStats(buildingId, id)
  if (!vendor) notFound()

  const canManage =
    (await isSuperAdmin(user.id)) ||
    (await hasRole(buildingId, ['admin', 'treasurer', 'committee'], user.id))

  const expenses = await listVendorExpenses(buildingId, id, 50)

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">
        <Link
          href="/vendors"
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4 lucide-chevron-right" />
          العودة إلى الموردين
        </Link>
      </div>

      <PageHeader
        title={vendor.name}
        description={vendor.specialty ?? 'مورد بدون تخصص محدَّد'}
        actions={
          <div className="flex items-center gap-2">
            {!vendor.is_active && (
              <Badge variant="secondary">
                <Archive className="h-3 w-3" />
                مؤرشف
              </Badge>
            )}
            {canManage && <VendorActions vendor={vendor} />}
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              التقييم
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RatingStars value={vendor.rating} readOnly size="h-6 w-6" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              عدد المصروفات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {vendor.expenses_count}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              إجمالي المدفوع/المعتمد
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {formatCurrency(vendor.total_amount)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">معلومات التواصل</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
          <div>
            <div className="text-muted-foreground flex items-center gap-1">
              <Phone className="h-3.5 w-3.5" /> الجوال
            </div>
            {vendor.phone ? (
              <a
                href={`tel:${vendor.phone}`}
                className="text-primary hover:underline tabular-nums"
              >
                {vendor.phone}
              </a>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
          <div>
            <div className="text-muted-foreground flex items-center gap-1">
              <Tag className="h-3.5 w-3.5" /> التخصص
            </div>
            <div>{vendor.specialty ?? '—'}</div>
          </div>
        </CardContent>
      </Card>

      {vendor.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ملاحظات</CardTitle>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">
            {vendor.notes}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">سجل المصروفات</CardTitle>
          <CardDescription>
            آخر {expenses.length} مصروف مُسجَّل لهذا المورد.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {expenses.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              لا توجد مصروفات مرتبطة بهذا المورد بعد.
            </div>
          ) : (
            <table className="w-full min-w-[600px] text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="h-10 px-3 text-right font-medium">التاريخ</th>
                  <th className="h-10 px-3 text-right font-medium">العنوان</th>
                  <th className="h-10 px-3 text-right font-medium">المبلغ</th>
                  <th className="h-10 px-3 text-right font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr
                    key={e.id}
                    className="border-t border-border hover:bg-muted/30 transition-colors"
                  >
                    <td className="h-12 px-3 align-middle whitespace-nowrap">
                      {formatDate(e.expense_date)}
                    </td>
                    <td className="h-12 px-3 align-middle">
                      <Link
                        href={`/expenses/${e.id}`}
                        className="font-medium hover:underline truncate block max-w-[300px]"
                      >
                        {e.title}
                      </Link>
                    </td>
                    <td className="h-12 px-3 align-middle font-semibold tabular-nums">
                      {formatCurrency(Number(e.amount))}
                    </td>
                    <td className="h-12 px-3 align-middle">
                      <ExpenseStatusBadge status={e.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {vendor.phone && (
        <Button asChild size="lg" className="w-full sm:hidden">
          <a href={`tel:${vendor.phone}`}>
            <Phone className="h-5 w-5" />
            اتصل بـ {vendor.name}
          </a>
        </Button>
      )}
    </div>
  )
}
