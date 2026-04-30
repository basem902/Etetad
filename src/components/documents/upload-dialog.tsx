'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileText, X } from 'lucide-react'
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
import { uploadDocumentAction } from '@/actions/documents'
import {
  ALLOWED_DOCUMENT_MIMES,
  MAX_DOCUMENT_SIZE,
} from '@/lib/storage'

interface Props {
  /** Distinct categories from existing documents (autocomplete). */
  categorySuggestions: string[]
}

export function UploadDialog({ categorySuggestions }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [pickedFile, setPickedFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [isPublic, setIsPublic] = useState<boolean>(true)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setFileError(null)
    if (!f) {
      setPickedFile(null)
      return
    }
    if (f.size > MAX_DOCUMENT_SIZE) {
      setFileError('الحجم يجب أن يكون أقل من 25 ميجا')
      e.target.value = ''
      return
    }
    if (!(ALLOWED_DOCUMENT_MIMES as readonly string[]).includes(f.type)) {
      setFileError('PDF, Word, Excel, JPG, PNG فقط')
      e.target.value = ''
      return
    }
    setPickedFile(f)
  }

  function clearFile() {
    if (fileRef.current) fileRef.current.value = ''
    setPickedFile(null)
    setFileError(null)
  }

  function onSubmit(formData: FormData) {
    if (!pickedFile) {
      toast.error('اختر ملفاً')
      return
    }
    formData.set('is_public', isPublic ? 'true' : 'false')
    startTransition(async () => {
      const r = await uploadDocumentAction(formData)
      if (r.success) {
        toast.success(r.message ?? 'تم الرفع')
        setOpen(false)
        setPickedFile(null)
        setIsPublic(true)
        if (fileRef.current) fileRef.current.value = ''
        router.refresh()
      } else {
        toast.error(r.error)
      }
    })
  }

  const datalistId = 'document-category-suggestions'

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)} disabled={isPending}>
        <Upload className="h-4 w-4" />
        رفع مستند
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>رفع مستند جديد</DialogTitle>
          <DialogDescription>
            PDF, Word, Excel, JPG, PNG — الحد الأقصى 25 ميجا.
          </DialogDescription>
        </DialogHeader>

        <form action={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="title">عنوان المستند</Label>
            <Input
              id="title"
              name="title"
              required
              minLength={2}
              maxLength={200}
              disabled={isPending}
              placeholder="مثلاً: عقد صيانة المصعد 2026"
            />
          </div>

          <div>
            <Label htmlFor="category">التصنيف (اختياري)</Label>
            <Input
              id="category"
              name="category"
              list={datalistId}
              maxLength={80}
              disabled={isPending}
              placeholder="مثلاً: عقود، فواتير، محاضر اجتماعات"
            />
            <datalist id={datalistId}>
              {categorySuggestions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="is_public"
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              disabled={isPending}
              className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
            />
            <Label htmlFor="is_public" className="cursor-pointer text-sm">
              متاح لكل سكان العمارة (إن لم يُحدَّد، يَراه المدير/الأمين/اللجنة فقط)
            </Label>
          </div>

          <div>
            <Label htmlFor="file">الملف</Label>
            <Input
              ref={fileRef}
              id="file"
              type="file"
              name="file"
              required
              accept={ALLOWED_DOCUMENT_MIMES.join(',')}
              onChange={handleFile}
              disabled={isPending}
              className="cursor-pointer"
            />
            {pickedFile && (
              <div className="mt-2 flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium truncate">{pickedFile.name}</span>
                <span className="text-xs text-muted-foreground">
                  ({(pickedFile.size / 1024).toFixed(0)} ك.ب)
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearFile}
                  disabled={isPending}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
            {fileError && (
              <p className="text-sm text-destructive mt-1">{fileError}</p>
            )}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                تراجع
              </Button>
            </DialogClose>
            <Button type="submit" loading={isPending} disabled={!pickedFile}>
              <Upload className="h-4 w-4" />
              رفع
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
