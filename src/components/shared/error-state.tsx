'use client'

import { AlertTriangle, RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ErrorStateProps {
  title?: string
  description?: string
  onRetry?: () => void
  retryLabel?: string
  className?: string
}

export function ErrorState({
  title = 'حدث خطأ',
  description = 'تعذّر تحميل البيانات. حاول مرة أخرى.',
  onRetry,
  retryLabel = 'إعادة المحاولة',
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center text-center',
        'rounded-lg border border-destructive/40 bg-destructive/5 px-6 py-12',
        className,
      )}
    >
      <div
        aria-hidden
        className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive"
      >
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      {onRetry && (
        <Button onClick={onRetry} variant="outline" size="sm" className="mt-4">
          <RefreshCcw className="h-4 w-4" />
          {retryLabel}
        </Button>
      )}
    </div>
  )
}
