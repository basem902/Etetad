'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Eye,
  X,
  Play,
  CheckCircle2,
  RotateCcw,
  Camera,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import {
  reviewMaintenanceAction,
  startMaintenanceAction,
  rejectMaintenanceAction,
  completeMaintenanceAction,
  reopenMaintenanceAction,
} from '@/actions/maintenance'
import {
  ALLOWED_MAINTENANCE_MIMES,
  MAX_MAINTENANCE_IMAGE_SIZE,
} from '@/lib/storage'
import type { MaintenanceStatus } from '@/types/database'

interface Props {
  requestId: string
  status: MaintenanceStatus
  /** When true, the user is admin/committee or super-admin (broader actions). */
  isManager: boolean
  /** When true, the user is the assigned technician (limited actions). */
  isAssignee: boolean
}

/**
 * Workflow buttons for the maintenance detail page. Visibility per role:
 *   manager (admin/committee):
 *     new → "بدء المراجعة" + "رفض"
 *     reviewing → "رفض" (assign + quote handled by AssignTechnician + saveQuote)
 *     waiting_quote → "رفض"
 *     waiting_approval → "بدء العمل" + "رفض"
 *     in_progress → "إعادة فتح" (escalate)
 *     completed → "إعادة فتح"
 *     reopened → "بدء العمل" or "إعادة المراجعة" (handled by transition)
 *
 *   assignee (technician):
 *     in_progress → "إغلاق الطلب" (with after_image) + "إعادة فتح" (escalate)
 *     completed/other → none (only manager can act)
 */
export function WorkflowActions({
  requestId,
  status,
  isManager,
  isAssignee,
}: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [pickedFile, setPickedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function runStatusAction(
    fn: () => Promise<{ success: boolean; error?: string; message?: string }>,
  ): Promise<void> {
    return new Promise((resolve) => {
      startTransition(async () => {
        const r = await fn()
        if (r.success) {
          toast.success(r.message ?? 'تم تحديث الطلب')
          router.refresh()
        } else {
          toast.error(r.error ?? 'تعذّر تنفيذ العملية')
        }
        resolve()
      })
    })
  }

  function handleAfterFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setFileError(null)
    if (!f) {
      setPickedFile(null)
      setPreviewUrl(null)
      return
    }
    if (f.size > MAX_MAINTENANCE_IMAGE_SIZE) {
      setFileError('الحجم يجب أن يكون أقل من 10 ميجا')
      e.target.value = ''
      return
    }
    if (!(ALLOWED_MAINTENANCE_MIMES as readonly string[]).includes(f.type)) {
      setFileError('JPG, PNG, WebP فقط')
      e.target.value = ''
      return
    }
    setPickedFile(f)
    setPreviewUrl(URL.createObjectURL(f))
  }

  function handleComplete() {
    if (!pickedFile) {
      toast.error('صورة "بعد" مطلوبة لإثبات الإنجاز')
      return
    }
    const fd = new FormData()
    fd.set('request_id', requestId)
    fd.set('after_image', pickedFile)
    startTransition(async () => {
      const r = await completeMaintenanceAction(fd)
      if (r.success) {
        toast.success(r.message ?? 'تم إغلاق الطلب')
        setCompleteOpen(false)
        setPickedFile(null)
        setPreviewUrl(null)
        if (fileRef.current) fileRef.current.value = ''
        router.refresh()
      } else {
        toast.error(r.error)
      }
    })
  }

  // ============= Render =============
  const buttons: React.ReactNode[] = []

  if (isManager && (status === 'new' || status === 'reopened')) {
    buttons.push(
      <ConfirmDialog
        key="review"
        title="بدء المراجعة"
        description="انقل الطلب لحالة «قيد المراجعة» لإسناد فني أو طلب عرض سعر."
        confirmLabel="ابدأ المراجعة"
        cancelLabel="تراجع"
        onConfirm={() => runStatusAction(() => reviewMaintenanceAction(requestId))}
        trigger={
          <Button size="sm" disabled={isPending}>
            <Eye className="h-4 w-4" />
            بدء المراجعة
          </Button>
        }
      />,
    )
  }

  if (isManager && (status === 'waiting_approval' || status === 'reopened')) {
    buttons.push(
      <ConfirmDialog
        key="start"
        title="بدء العمل"
        description="بعد التأكيد، الطلب ينتقل للفني المُسند للتنفيذ."
        confirmLabel="ابدأ"
        cancelLabel="تراجع"
        onConfirm={() => runStatusAction(() => startMaintenanceAction(requestId))}
        trigger={
          <Button size="sm" disabled={isPending}>
            <Play className="h-4 w-4" />
            بدء العمل
          </Button>
        }
      />,
    )
  }

  if (
    isManager &&
    (status === 'new' ||
      status === 'reviewing' ||
      status === 'waiting_quote' ||
      status === 'waiting_approval')
  ) {
    buttons.push(
      <ConfirmDialog
        key="reject"
        title="رفض الطلب"
        description="الرفض نهائي لمسار هذا الطلب. لا يمكن إرجاعه بعد الرفض."
        confirmLabel="تأكيد الرفض"
        cancelLabel="تراجع"
        onConfirm={() => runStatusAction(() => rejectMaintenanceAction(requestId))}
        trigger={
          <Button size="sm" variant="destructive" disabled={isPending}>
            <X className="h-4 w-4" />
            رفض الطلب
          </Button>
        }
      />,
    )
  }

  // Assignee or manager can complete an in-progress request.
  if (status === 'in_progress' && (isAssignee || isManager)) {
    buttons.push(
      <Dialog key="complete" open={completeOpen} onOpenChange={setCompleteOpen}>
        <Button
          size="sm"
          onClick={() => setCompleteOpen(true)}
          disabled={isPending}
        >
          <CheckCircle2 className="h-4 w-4" />
          إغلاق الطلب
        </Button>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إغلاق الطلب</DialogTitle>
            <DialogDescription>
              ارفع صورة «بعد» لإثبات إنجاز العمل. لا يمكن إغلاق الطلب بدون صورة.
            </DialogDescription>
          </DialogHeader>

          <div>
            <Label htmlFor="after_image">
              <Camera className="inline h-3 w-3" /> صورة «بعد» (إلزامي)
            </Label>
            <Input
              ref={fileRef}
              id="after_image"
              type="file"
              accept={ALLOWED_MAINTENANCE_MIMES.join(',')}
              onChange={handleAfterFile}
              disabled={isPending}
              className="cursor-pointer"
            />
            {previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="معاينة الصورة"
                className="mt-2 h-32 rounded-md object-cover border border-border"
              />
            )}
            {fileError && (
              <p className="text-sm text-destructive mt-1">{fileError}</p>
            )}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={isPending}>
                تراجع
              </Button>
            </DialogClose>
            <Button
              onClick={handleComplete}
              loading={isPending}
              disabled={!pickedFile}
            >
              تأكيد الإغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    )
  }

  // Reopen: assignee can escalate from in_progress; manager can reopen completed.
  if (
    (status === 'in_progress' && (isAssignee || isManager)) ||
    (status === 'completed' && isManager)
  ) {
    buttons.push(
      <ConfirmDialog
        key="reopen"
        title="إعادة فتح الطلب"
        description={
          status === 'completed'
            ? 'الطلب مغلق حالياً. سيُعاد فتحه ليُكمل العمل عليه.'
            : 'إعادة الطلب لحالة "أُعيد فتحه" — قد يحتاج لتقييم أو فني آخر.'
        }
        confirmLabel="إعادة فتح"
        cancelLabel="تراجع"
        onConfirm={() => runStatusAction(() => reopenMaintenanceAction(requestId))}
        trigger={
          <Button size="sm" variant="outline" disabled={isPending}>
            <RotateCcw className="h-4 w-4" />
            إعادة فتح
          </Button>
        }
      />,
    )
  }

  if (buttons.length === 0) return null
  return <div className="flex flex-wrap items-center gap-2">{buttons}</div>
}
