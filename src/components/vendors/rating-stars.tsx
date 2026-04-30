'use client'

import { useState } from 'react'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  /** Current rating value 0..5 (or null = no rating). */
  value: number | null
  /** Called when the user clicks a star. If omitted, the component is read-only. */
  onChange?: (value: number) => void
  /** When true, render as static (display) regardless of onChange. */
  readOnly?: boolean
  /** Star size class — defaults to "h-5 w-5". */
  size?: string
  /** When true, allow setting back to 0 by clicking the same star. */
  allowClear?: boolean
}

/**
 * Interactive 5-star rating widget. Half-star rounding is supported on display
 * but click resolves to integer steps (0..5) for simplicity. Codex P9.1 lists
 * "rating بنجوم تفاعلية" — this is the canonical implementation.
 */
export function RatingStars({
  value,
  onChange,
  readOnly,
  size = 'h-5 w-5',
  allowClear = true,
}: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const interactive = !readOnly && Boolean(onChange)

  const display = hover ?? value ?? 0

  return (
    <div className="inline-flex items-center gap-0.5" role={interactive ? 'radiogroup' : 'img'} aria-label={`تقييم ${value ?? 0} من 5`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= display
        const halfFilled = !filled && value !== null && n - 0.5 <= value
        return (
          <button
            key={n}
            type="button"
            disabled={!interactive}
            onMouseEnter={() => interactive && setHover(n)}
            onMouseLeave={() => interactive && setHover(null)}
            onClick={() => {
              if (!interactive || !onChange) return
              if (allowClear && value === n) {
                onChange(0)
              } else {
                onChange(n)
              }
            }}
            className={cn(
              'transition-transform',
              interactive ? 'cursor-pointer hover:scale-110' : 'cursor-default',
            )}
            aria-label={`${n} من 5`}
          >
            <Star
              className={cn(
                size,
                filled ? 'fill-warning text-warning' : halfFilled ? 'fill-warning/50 text-warning' : 'text-muted-foreground',
              )}
            />
          </button>
        )
      })}
      {value != null && value > 0 && (
        <span className="ms-2 text-xs text-muted-foreground tabular-nums">
          {value.toFixed(1)}
        </span>
      )}
    </div>
  )
}
