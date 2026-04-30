'use client'

import { useEffect, useState } from 'react'
import { Camera } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/client'
import { MAINTENANCE_BUCKET } from '@/lib/storage'

interface Props {
  beforePath: string | null
  afterPath: string | null
}

function ImageSlot({
  path,
  label,
  emptyText,
}: {
  path: string | null
  label: string
  emptyText: string
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(Boolean(path))

  useEffect(() => {
    if (!path) {
      setUrl(null)
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const supabase = createClient()
      const { data } = await supabase.storage
        .from(MAINTENANCE_BUCKET)
        .createSignedUrl(path, 3600)
      if (cancelled) return
      setUrl(data?.signedUrl ?? null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [path])

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-muted-foreground flex items-center gap-1">
        <Camera className="h-3.5 w-3.5" />
        {label}
      </div>
      {!path ? (
        <div className="flex h-48 items-center justify-center rounded-md border border-dashed border-border bg-muted/30 text-xs text-muted-foreground">
          {emptyText}
        </div>
      ) : loading ? (
        <Skeleton className="h-48 w-full rounded-md" />
      ) : url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-md border border-border overflow-hidden hover:opacity-95 transition-opacity"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={label}
            className="h-48 w-full object-cover bg-muted"
          />
        </a>
      ) : (
        <div className="flex h-48 items-center justify-center rounded-md border border-destructive/40 bg-destructive/5 text-xs text-destructive">
          تعذّر تحميل الصورة
        </div>
      )}
    </div>
  )
}

export function BeforeAfterImages({ beforePath, afterPath }: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <ImageSlot
        path={beforePath}
        label="قبل"
        emptyText="لم تُرفع صورة قبل"
      />
      <ImageSlot
        path={afterPath}
        label="بعد"
        emptyText="لم تُرفع صورة بعد بعد"
      />
    </div>
  )
}
