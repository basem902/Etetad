'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Plus, Power, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { ChangePlanDialog } from '@/components/super-admin/change-plan-dialog'
import {
  expireBuildingAction,
  extendTrialAction,
  reactivateBuildingAction,
  updateBuildingSubscriptionAction,
} from '@/actions/super-admin'
import type {
  SubscriptionPlan,
  SubscriptionStatus,
} from '@/types/database'

interface Props {
  buildingId: string
  buildingName: string
  currentPlan: SubscriptionPlan
  currentStatus: SubscriptionStatus
  trialEndsAt: string | null
  subscriptionEndsAt: string | null
}

// =============================================
// Subscription controls (super-admin)
// =============================================
// Three action surfaces, all gated server-side via ensureSuperAdmin() in
// /actions/super-admin.ts (which double-checks the SECURITY DEFINER RPC):
//
//   1. Full edit form  → updateBuildingSubscriptionAction
//   2. Extend trial    → extendTrialAction (idempotent: trial-only)
//   3. Expire / Reactivate → quick toggles for ops use
//
// The transition whitelist lives in 16_phase14.sql (trigger). The UI does
// NOT pre-filter status options; instead we surface server errors via toast,
// so a single source of truth (the trigger) governs allowed transitions.
// =============================================

function dateToInput(value: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  // <input type="datetime-local"> wants yyyy-MM-ddTHH:mm in *local* time.
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function SubscriptionControls({
  buildingId,
  buildingName,
  currentPlan,
  currentStatus,
  trialEndsAt,
  subscriptionEndsAt,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [plan, setPlan] = useState<SubscriptionPlan>(currentPlan)
  const [status, setStatus] = useState<SubscriptionStatus>(currentStatus)
  const [trialEnd, setTrialEnd] = useState<string>(dateToInput(trialEndsAt))
  const [subEnd, setSubEnd] = useState<string>(dateToInput(subscriptionEndsAt))
  const [extendDays, setExtendDays] = useState<number>(7)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData()
    fd.set('building_id', buildingId)
    fd.set('plan', plan)
    fd.set('status', status)
    if (trialEnd) fd.set('trial_ends_at', new Date(trialEnd).toISOString())
    if (subEnd) fd.set('subscription_ends_at', new Date(subEnd).toISOString())

    startTransition(async () => {
      const result = await updateBuildingSubscriptionAction(fd)
      if (result.success) {
        toast.success(result.message ?? 'تم التحديث')
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleExtend() {
    if (!Number.isFinite(extendDays) || extendDays < 1 || extendDays > 365) {
      toast.error('عدد الأيام يجب أن يكون بين 1 و 365')
      return
    }
    startTransition(async () => {
      const result = await extendTrialAction(buildingId, extendDays)
      if (result.success) {
        toast.success(result.message ?? 'تم تمديد التجربة')
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  async function handleExpire() {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const result = await expireBuildingAction(buildingId)
        if (result.success) {
          toast.success(result.message ?? 'تم تعطيل العمارة')
          router.refresh()
        } else {
          toast.error(result.error)
        }
        resolve()
      })
    })
  }

  async function handleReactivate() {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const result = await reactivateBuildingAction(buildingId)
        if (result.success) {
          toast.success(result.message ?? 'تم إعادة تفعيل العمارة')
          router.refresh()
        } else {
          toast.error(result.error)
        }
        resolve()
      })
    })
  }

  const isTrial = currentStatus === 'trial'
  const isInactive =
    currentStatus === 'expired' || currentStatus === 'cancelled'

  return (
    <Card>
      <CardHeader>
        <CardTitle>إعدادات الاشتراك</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Quick actions */}
        <div className="flex flex-wrap items-center gap-2">
          {isTrial && (
            <div className="flex items-end gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="extend-days">تمديد التجربة (أيام)</Label>
                <Input
                  id="extend-days"
                  type="number"
                  min={1}
                  max={365}
                  inputMode="numeric"
                  className="w-[120px]"
                  value={extendDays}
                  onChange={(e) => setExtendDays(Number(e.target.value))}
                  disabled={isPending}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleExtend}
                disabled={isPending}
              >
                <Plus className="h-4 w-4" />
                تمديد
              </Button>
            </div>
          )}

          {!isInactive && (
            <ConfirmDialog
              title="تعطيل العمارة"
              description="سيُمنع كل أعضاء العمارة من الوصول حتى يُعاد التفعيل. هل أنت متأكد؟"
              confirmLabel="تعطيل"
              destructive
              onConfirm={handleExpire}
              trigger={
                <Button type="button" variant="destructive" disabled={isPending}>
                  <Power className="h-4 w-4" />
                  تعطيل العمارة
                </Button>
              }
            />
          )}

          {isInactive && (
            <ConfirmDialog
              title="إعادة تفعيل العمارة"
              description="سيُعاد وصول كل الأعضاء النشطين إلى المنصة."
              confirmLabel="تفعيل"
              onConfirm={handleReactivate}
              trigger={
                <Button type="button" variant="default" disabled={isPending}>
                  <RotateCcw className="h-4 w-4" />
                  إعادة تفعيل
                </Button>
              }
            />
          )}

          {/* Phase 19: direct plan-change override (super-admin only) */}
          <ChangePlanDialog
            buildingId={buildingId}
            buildingName={buildingName}
            currentTier={currentPlan}
          />
        </div>

        {/* Full edit form */}
        <form onSubmit={handleSubmit} className="space-y-4 border-t border-border pt-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="plan">الخطة</Label>
              <Select
                value={plan}
                onValueChange={(v) => setPlan(v as SubscriptionPlan)}
              >
                <SelectTrigger id="plan">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">تجربة</SelectItem>
                  <SelectItem value="basic">أساسية</SelectItem>
                  <SelectItem value="pro">احترافية</SelectItem>
                  <SelectItem value="enterprise">مؤسسات</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="status">الحالة</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as SubscriptionStatus)}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">تجربة</SelectItem>
                  <SelectItem value="active">نشطة</SelectItem>
                  <SelectItem value="past_due">متأخّرة</SelectItem>
                  <SelectItem value="cancelled">ملغاة</SelectItem>
                  <SelectItem value="expired">منتهية</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                التحويلات المسموحة محسوبة في قاعدة البيانات. ستظهر رسالة خطأ
                إن كان التحويل غير صالح.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="trial_ends_at">انتهاء التجربة</Label>
              <Input
                id="trial_ends_at"
                type="datetime-local"
                value={trialEnd}
                onChange={(e) => setTrialEnd(e.target.value)}
                disabled={isPending}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="subscription_ends_at">انتهاء الاشتراك</Label>
              <Input
                id="subscription_ends_at"
                type="datetime-local"
                value={subEnd}
                onChange={(e) => setSubEnd(e.target.value)}
                disabled={isPending}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" loading={isPending}>
              <CheckCircle2 className="h-4 w-4" />
              حفظ التغييرات
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
