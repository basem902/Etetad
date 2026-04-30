import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Building2, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/shared/page-header'
import {
  SubscriptionPlanBadge,
  SubscriptionStatusBadge,
} from '@/components/super-admin/subscription-badges'
import { SubscriptionControls } from '@/components/super-admin/subscription-controls'
import { UsageStats } from '@/components/super-admin/usage-stats'
import { getBuildingDetail } from '@/lib/queries/super-admin'
import { formatDate } from '@/lib/format'

export const metadata: Metadata = {
  title: 'تفاصيل العمارة · Super Admin',
}

export default async function SuperAdminBuildingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { building, usage } = await getBuildingDetail(id)
  if (!building) notFound()

  return (
    <div className="space-y-6">
      <PageHeader
        title={building.name}
        description="إدارة الاشتراك ومراقبة استخدام العمارة."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/super-admin/buildings">
              <ArrowRight className="h-4 w-4" />
              عودة
            </Link>
          </Button>
        }
      />

      {/* Building summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" aria-hidden />
            ملخّص العمارة
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">الخطة الحالية:</span>{' '}
            <SubscriptionPlanBadge plan={building.subscription_plan} />
          </div>
          <div>
            <span className="text-muted-foreground">الحالة الحالية:</span>{' '}
            <SubscriptionStatusBadge status={building.subscription_status} />
          </div>
          <div>
            <span className="text-muted-foreground">انتهاء التجربة:</span>{' '}
            {formatDate(building.trial_ends_at)}
          </div>
          <div>
            <span className="text-muted-foreground">انتهاء الاشتراك:</span>{' '}
            {formatDate(building.subscription_ends_at)}
          </div>
          {building.address && (
            <div className="sm:col-span-2 flex items-start gap-1.5 text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 mt-0.5" aria-hidden />
              {building.address}
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            أُنشئت: {formatDate(building.created_at)}
          </div>
        </CardContent>
      </Card>

      {/* Usage stats */}
      <UsageStats usage={usage} />

      {/* Subscription controls */}
      <SubscriptionControls
        buildingId={building.id}
        buildingName={building.name}
        currentPlan={building.subscription_plan}
        currentStatus={building.subscription_status}
        trialEndsAt={building.trial_ends_at}
        subscriptionEndsAt={building.subscription_ends_at}
      />
    </div>
  )
}
