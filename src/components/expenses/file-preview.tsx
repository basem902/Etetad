'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/client'
import { isImagePath } from '@/lib/storage'

interface Props {
  /** Storage bucket id (e.g. 'invoices' or 'receipts'). */
  bucket: string
  /** Object path inside the bucket. */
  path: string
  /** Alt text for image previews / button label suffix. */
  label: string
}

/**
 * Shared signed-URL preview used by the expense detail page for both invoices
 * (in the `invoices` bucket) and proof-of-payment receipts (in the `receipts`
 * bucket). Mirrors the pattern of payments/receipt-preview but parameterized.
 */
export function FilePreview({ bucket, path, label }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const supabase = createClient()
      const { data, error: e } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 3600)
      if (cancelled) return
      if (e || !data?.signedUrl) {
        setError('تعذّر تحميل الملف')
      } else {
        setUrl(data.signedUrl)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [bucket, path])

  if (loading) {
    return <Skeleton className="h-48 w-full max-w-md rounded-md" />
  }
  if (error || !url) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        {error ?? 'تعذّر تحميل الملف'}
      </div>
    )
  }

  if (isImagePath(path)) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block rounded-md border border-border overflow-hidden hover:opacity-95 transition-opacity"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={label}
          className="max-h-96 max-w-full object-contain bg-muted"
        />
      </a>
    )
  }

  return (
    <Button asChild variant="outline">
      <a href={url} target="_blank" rel="noopener noreferrer">
        <FileText className="h-4 w-4" />
        فتح {label} (PDF)
        <ExternalLink className="h-3 w-3" />
      </a>
    </Button>
  )
}
