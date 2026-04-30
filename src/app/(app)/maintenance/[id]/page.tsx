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
import {
  MaintenanceStatusBadge,
  PriorityBadge,
} from '@/components/dashboard/status-badges'
import { WorkflowActions } from '@/components/maintenance/workflow-actions'
import { AssignTechnician } from '@/components/maintenance/assign-technician'
import { BeforeAfterImages } from '@/components/maintenance/before-after-images'
import { LinkExpenseDialog } from '@/components/maintenance/link-expense-dialog'
import { StatusTimeline } from '@/components/maintenance/status-timeline'
import {
  getMaintenanceRequest,
  listMaintenanceTimeline,
  listTechnicians,
} from '@/lib/queries/maintenance'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format'
import type { MaintenanceLocation } from '@/types/database'

const LOCATION_LABELS: Record<MaintenanceLocation, string> = {
  apartment: 'داخل شقة',
  entrance: 'المدخل',
  elevator: 'المصعد',
  roof: 'السطح',
  parking: 'الموقف',
  other: 'أخرى',
}

export const metadata: Metadata = {
  title: 'تفاصيل طلب الصيانة · نظام إدارة العمارة',
}

export default async function MaintenanceDetailPage({
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

  const request = await getMaintenanceRequest(buildingId, id)
  if (!request) notFound()

  const isManager =
    (await isSuperAdmin(user.id)) ||
    (await hasRole(buildingId, ['admin', 'committee'], user.id))
  const isAssignee = request.assigned_to === user.id

  // Show "إسناد لفني" for reviewing/waiting_quote.
  const canAssign =
    isManager &&
    (request.status === 'reviewing' || request.status === 'waiting_quote')
  const technicians = canAssign ? await listTechnicians(buildingId) : []

  // Allow expense link for any active state past review.
  const canLinkExpense =
    isManager &&
    request.status !== 'new' &&
    request.status !== 'rejected'

  const timeline = await listMaintenanceTimeline(buildingId, id)

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">
        <Link
          href="/maintenance"
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4 lucide-chevron-right" />
          العودة إلى طلبات الصيانة
        </Link>
      </div>

      <PageHeader
        title={request.title}
        description={`${LOCATION_LABELS[request.location_type]}${
          request.apartment_number ? ` · شقة ${request.apartment_number}` : ''
        } · ${formatDate(request.created_at)}`}
        actions={
          <div className="flex items-center gap-2">
            <PriorityBadge priority={request.priority} />
            <MaintenanceStatusBadge status={request.status} />
          </div>
        }
      />

      {/* Workflow card */}
      {(isManager || isAssignee) && (
        <Card className="border-warning/40 bg-warning/5">
          <CardHeader>
            <CardTitle className="text-base">إجراءات الـ workflow</CardTitle>
            <CardDescription>
              {request.status === 'new' &&
                isManager &&
                'الطلب جديد. ابدأ المراجعة أو ارفضه.'}
              {request.status === 'reviewing' &&
                'قيد المراجعة. أَسند لفني (مع تكلفة متوقَّعة) أو احفظ عرض السعر فقط.'}
              {request.status === 'waiting_quote' &&
                'بانتظار عرض السعر. أَسند لفني عند الحصول على العرض.'}
              {request.status === 'waiting_approval' &&
                'بانتظار الاعتماد. ابدأ العمل بعد التأكد من العرض والفني.'}
              {request.status === 'in_progress' &&
                'قيد التنفيذ. الفني يستطيع رفع صورة "بعد" وإغلاق الطلب.'}
              {request.status === 'completed' &&
                'مكتمل. يمكن إعادة فتحه إن لم يكن العمل مرضياً.'}
              {request.status === 'rejected' &&
                'مرفوض نهائياً. لا توجد إجراءات إضافية.'}
              {request.status === 'reopened' &&
                'أُعيد فتحه. واصل العمل أو أعد المراجعة لإسناد فني آخر.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <WorkflowActions
              requestId={request.id}
              status={request.status}
              isManager={isManager}
              isAssignee={isAssignee}
            />
            {canAssign && (
              <AssignTechnician
                requestId={request.id}
                technicians={technicians}
                defaultCost={request.cost == null ? null : Number(request.cost)}
              />
            )}
            {canLinkExpense && (
              <LinkExpenseDialog
                requestId={request.id}
                cost={request.cost == null ? null : Number(request.cost)}
                existingExpenseId={request.related_expense_id}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Description */}
      {request.description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">وصف المشكلة</CardTitle>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">
            {request.description}
          </CardContent>
        </Card>
      )}

      {/* Before / after images */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">صور الموقع</CardTitle>
        </CardHeader>
        <CardContent>
          <BeforeAfterImages
            beforePath={request.before_image_url}
            afterPath={request.after_image_url}
          />
        </CardContent>
      </Card>

      {/* Cost + linked expense */}
      {(request.cost != null || request.related_expense_id) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">المالية</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
            {request.cost != null && (
              <div>
                <div className="text-muted-foreground">التكلفة</div>
                <div className="font-semibold tabular-nums">
                  {formatCurrency(Number(request.cost))}
                </div>
              </div>
            )}
            {request.related_expense_id && (
              <div>
                <div className="text-muted-foreground">المصروف المرتبط</div>
                <Link
                  href={`/expenses/${request.related_expense_id}`}
                  className="hover:underline"
                >
                  عرض المصروف
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Parties */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">الأطراف</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
          <div>
            <div className="text-muted-foreground">المُنشئ</div>
            <div>{request.requester_name ?? '—'}</div>
          </div>
          <div>
            <div className="text-muted-foreground">الفني المُسند</div>
            <div>{request.assignee_name ?? 'لم يُسنَد بعد'}</div>
          </div>
          {request.completed_at && (
            <div>
              <div className="text-muted-foreground">تاريخ الإغلاق</div>
              <div>{formatDateTime(request.completed_at)}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">سجل الأحداث</CardTitle>
          <CardDescription>
            من سجل التدقيق — كل تغيير حالة أو تعديل بيانات.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StatusTimeline entries={timeline} />
        </CardContent>
      </Card>
    </div>
  )
}
