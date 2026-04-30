import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
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
import { PageHeader } from '@/components/shared/page-header'
import { ExpenseStatusBadge } from '@/components/expenses/expense-status-badge'
import { StatusActions } from '@/components/expenses/status-actions'
import { CancelDialog } from '@/components/expenses/cancel-dialog'
import { FilePreview } from '@/components/expenses/file-preview'
import { getExpense } from '@/lib/queries/expenses'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format'
import { INVOICES_BUCKET, RECEIPTS_BUCKET } from '@/lib/storage'

export const metadata: Metadata = {
  title: 'تفاصيل المصروف · نظام إدارة العمارة',
}

export default async function ExpenseDetailsPage({
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

  const expense = await getExpense(buildingId, id)
  if (!expense) notFound()

  const canManage =
    (await isSuperAdmin(user.id)) ||
    (await hasRole(buildingId, ['admin', 'treasurer'], user.id))

  const isTerminal = expense.status === 'paid' || expense.status === 'cancelled'
  const canCancel = canManage && !isTerminal

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">
        <Link
          href="/expenses"
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4 lucide-chevron-right" />
          العودة إلى المصروفات
        </Link>
      </div>

      <PageHeader
        title={expense.title}
        description={
          expense.category
            ? `${expense.category} · ${formatDate(expense.expense_date)}`
            : formatDate(expense.expense_date)
        }
        actions={<ExpenseStatusBadge status={expense.status} />}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              المبلغ
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {formatCurrency(Number(expense.amount))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              المورد
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-base font-medium">
              {expense.vendor_name ?? '—'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              التصنيف
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-base font-medium">{expense.category ?? '—'}</div>
          </CardContent>
        </Card>
      </div>

      {/* Workflow actions (treasurer/admin only). */}
      {canManage &&
        (expense.status === 'draft' ||
          expense.status === 'pending_review' ||
          expense.status === 'approved' ||
          expense.status === 'rejected') && (
          <Card className="border-warning/40 bg-warning/5">
            <CardHeader>
              <CardTitle className="text-base">إجراءات الـ workflow</CardTitle>
              <CardDescription>
                {expense.status === 'draft' &&
                  'حفظ كمسودّة. أرسل للمراجعة عند اكتمال البيانات.'}
                {expense.status === 'pending_review' &&
                  'بانتظار اعتماد أمين الصندوق/المدير.'}
                {expense.status === 'approved' &&
                  'معتمد. سجّل الدفع مع إيصال التحويل لإغلاق المصروف.'}
                {expense.status === 'rejected' &&
                  'مرفوض. اقرأ ملاحظة المراجِع في الوصف، عدّل البيانات، ثم أعد فتحه كمسودّة لإرساله مجدداً.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2">
              <StatusActions
                expenseId={expense.id}
                status={expense.status}
                variant="block"
              />
              {canCancel && <CancelDialog expenseId={expense.id} />}
              {(expense.status === 'draft' || expense.status === 'rejected') && (
                <Link
                  href={`/expenses/${expense.id}/edit`}
                  className="text-sm text-foreground hover:underline ms-auto"
                >
                  تعديل البيانات
                </Link>
              )}
            </CardContent>
          </Card>
        )}

      {/* Description (often holds reviewer feedback). */}
      {expense.description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">الوصف</CardTitle>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">
            {expense.description}
          </CardContent>
        </Card>
      )}

      {/* Cancellation reason (terminal cancelled state). */}
      {expense.status === 'cancelled' && expense.cancellation_reason && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-base">سبب الإلغاء</CardTitle>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">
            {expense.cancellation_reason}
          </CardContent>
        </Card>
      )}

      {/* Invoice (uploaded with the expense). */}
      {expense.invoice_url && (
        <Card>
          <CardHeader>
            <CardTitle>الفاتورة</CardTitle>
          </CardHeader>
          <CardContent>
            <FilePreview
              bucket={INVOICES_BUCKET}
              path={expense.invoice_url}
              label="الفاتورة"
            />
          </CardContent>
        </Card>
      )}

      {/* Payment proof receipt (set when status = paid). */}
      {expense.receipt_url && (
        <Card>
          <CardHeader>
            <CardTitle>إيصال الدفع</CardTitle>
          </CardHeader>
          <CardContent>
            <FilePreview
              bucket={RECEIPTS_BUCKET}
              path={expense.receipt_url}
              label="إيصال الدفع"
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">سجل العمليات</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
          <div>
            <div className="text-muted-foreground">المُنشئ</div>
            <div>{expense.created_by_name ?? '—'}</div>
          </div>
          <div>
            <div className="text-muted-foreground">تاريخ الإنشاء</div>
            <div>{formatDateTime(expense.created_at)}</div>
          </div>
          {expense.approved_by_name && (
            <>
              <div>
                <div className="text-muted-foreground">المُعتمِد</div>
                <div>{expense.approved_by_name}</div>
              </div>
              {expense.approved_at && (
                <div>
                  <div className="text-muted-foreground">تاريخ الاعتماد</div>
                  <div>{formatDateTime(expense.approved_at)}</div>
                </div>
              )}
            </>
          )}
          {expense.paid_by_name && (
            <>
              <div>
                <div className="text-muted-foreground">سجّل الدفع</div>
                <div>{expense.paid_by_name}</div>
              </div>
              {expense.paid_at && (
                <div>
                  <div className="text-muted-foreground">تاريخ الدفع</div>
                  <div>{formatDateTime(expense.paid_at)}</div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
