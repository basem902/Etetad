import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LoadingStateProps {
  message?: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

const sizeMap = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-10 w-10' }

export function LoadingState({
  message = 'جاري التحميل...',
  className,
  size = 'md',
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground',
        className,
      )}
    >
      <Loader2 className={cn('animate-spin', sizeMap[size])} aria-hidden />
      <p className="text-sm">{message}</p>
    </div>
  )
}
