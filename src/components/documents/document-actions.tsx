'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import {
  deleteDocumentAction,
  getDocumentDownloadUrlAction,
} from '@/actions/documents'
import type { DocumentRow } from '@/lib/queries/documents'

interface Props {
  document: DocumentRow
  canManage: boolean
}

export function DocumentActions({ document: d, canManage }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleDownload() {
    startTransition(async () => {
      const r = await getDocumentDownloadUrlAction(d.id)
      if (r.success && 'data' in r && r.data?.url) {
        // Open in a new tab to avoid blocking download
        window.open(r.data.url, '_blank', 'noopener,noreferrer')
      } else if (!r.success) {
        toast.error(r.error)
      }
    })
  }

  function handleDelete() {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const r = await deleteDocumentAction(d.id)
        if (r.success) {
          toast.success(r.message ?? 'تم الحذف')
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
      <Button
        size="sm"
        variant="outline"
        onClick={handleDownload}
        disabled={isPending}
        className="flex-1"
      >
        <Download className="h-4 w-4" />
        تحميل
      </Button>

      {canManage && (
        <ConfirmDialog
          title="حذف المستند"
          description="سيُحذف المستند والملف نهائياً. هذه العملية لا يمكن التراجع عنها."
          confirmLabel="حذف"
          cancelLabel="تراجع"
          onConfirm={handleDelete}
          trigger={
            <Button size="sm" variant="destructive" disabled={isPending}>
              <Trash2 className="h-4 w-4" />
            </Button>
          }
        />
      )}
    </div>
  )
}
