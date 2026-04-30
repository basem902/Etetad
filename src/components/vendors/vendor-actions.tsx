'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Pencil, Archive, ArchiveRestore } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { toggleVendorActiveAction } from '@/actions/vendors'
import type { VendorRow } from '@/lib/queries/vendors'

interface Props {
  vendor: VendorRow
}

export function VendorActions({ vendor }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleToggle(target: boolean) {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const r = await toggleVendorActiveAction(vendor.id, target)
        if (r.success) {
          toast.success(r.message ?? 'تم التحديث')
          router.refresh()
        } else {
          toast.error(r.error)
        }
        resolve()
      })
    })
  }

  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="outline" size="sm" disabled={isPending}>
        <Link href={`/vendors/${vendor.id}/edit`}>
          <Pencil className="h-4 w-4" />
          تعديل
        </Link>
      </Button>

      {vendor.is_active ? (
        <ConfirmDialog
          title="أرشفة المورد"
          description="بعد الأرشفة لن يظهر المورد في قوائم اختيار المصروفات الجديدة. يبقى متاحاً للمراجعة عبر فلتر «عرض المؤرشفين»."
          confirmLabel="أرشفة"
          cancelLabel="تراجع"
          onConfirm={() => handleToggle(false)}
          trigger={
            <Button variant="outline" size="sm" disabled={isPending}>
              <Archive className="h-4 w-4" />
              أرشفة
            </Button>
          }
        />
      ) : (
        <ConfirmDialog
          title="إعادة تفعيل المورد"
          description="سيظهر المورد مجدداً في قوائم اختيار المصروفات."
          confirmLabel="تفعيل"
          cancelLabel="تراجع"
          onConfirm={() => handleToggle(true)}
          trigger={
            <Button variant="outline" size="sm" disabled={isPending}>
              <ArchiveRestore className="h-4 w-4" />
              تفعيل
            </Button>
          }
        />
      )}
    </div>
  )
}
