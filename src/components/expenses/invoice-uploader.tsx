'use client'

import { useRef, useState } from 'react'
import { FileText, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ALLOWED_INVOICE_MIMES, MAX_INVOICE_SIZE } from '@/lib/storage'

interface Props {
  name: string
  required?: boolean
  disabled?: boolean
}

export function InvoiceUploader({ name, required, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null
    setError(null)
    if (!picked) {
      setFile(null)
      setPreviewUrl(null)
      return
    }
    if (picked.size > MAX_INVOICE_SIZE) {
      setError('الحجم يجب أن يكون أقل من 10 ميجا')
      e.target.value = ''
      setFile(null)
      setPreviewUrl(null)
      return
    }
    if (!(ALLOWED_INVOICE_MIMES as readonly string[]).includes(picked.type)) {
      setError('الأنواع المسموحة: صور (JPG/PNG/WebP) أو PDF')
      e.target.value = ''
      setFile(null)
      setPreviewUrl(null)
      return
    }
    setFile(picked)
    if (picked.type.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(picked))
    } else {
      setPreviewUrl(null)
    }
  }

  function clear() {
    if (inputRef.current) inputRef.current.value = ''
    setFile(null)
    setPreviewUrl(null)
    setError(null)
  }

  return (
    <div className="space-y-2">
      <Input
        ref={inputRef}
        type="file"
        name={name}
        required={required}
        disabled={disabled}
        accept={ALLOWED_INVOICE_MIMES.join(',')}
        onChange={handleChange}
        className="cursor-pointer"
      />

      {file && (
        <div className="flex items-start gap-3 rounded-md border border-border p-3 bg-muted/30">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="معاينة الفاتورة"
              className="h-24 w-24 rounded-md object-cover border border-border"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-md border border-border bg-background">
              <FileText className="h-8 w-8 text-muted-foreground" aria-hidden />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate text-sm">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {(file.size / 1024).toFixed(0)} كيلوبايت · {file.type}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-1 -ms-2"
              onClick={clear}
              disabled={disabled}
            >
              <X className="h-3.5 w-3.5" />
              إزالة
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <p className="text-xs text-muted-foreground">
        الأنواع المسموحة: JPG, PNG, WebP, PDF — الحد الأقصى 10 ميجا.
      </p>
    </div>
  )
}
