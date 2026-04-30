'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  oldValues: Record<string, unknown> | null
  newValues: Record<string, unknown> | null
}

function fmtVal(v: unknown): string {
  if (v == null) return '∅'
  if (typeof v === 'string') return v.length > 100 ? `${v.slice(0, 100)}…` : v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return JSON.stringify(v).slice(0, 100)
}

/**
 * Compares old_values vs new_values from audit_logs and renders a colored
 * diff (red for removed/old value, green for added/new value).
 */
export function DiffViewer({ oldValues, newValues }: Props) {
  const [expanded, setExpanded] = useState(false)

  // Collect all keys from both sides
  const keys = new Set<string>()
  if (oldValues) Object.keys(oldValues).forEach((k) => keys.add(k))
  if (newValues) Object.keys(newValues).forEach((k) => keys.add(k))

  // Filter to keys that actually changed
  const changed = Array.from(keys).filter((k) => {
    const o = oldValues?.[k]
    const n = newValues?.[k]
    return JSON.stringify(o) !== JSON.stringify(n)
  })

  if (changed.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">— لا تغييرات مسجَّلة —</span>
    )
  }

  // Hide noisy fields by default
  const noisy = new Set(['updated_at', 'created_at'])
  const meaningful = changed.filter((k) => !noisy.has(k))
  const display = expanded ? changed : meaningful.slice(0, 5)

  return (
    <div className="space-y-1.5 text-xs">
      {display.map((k) => {
        const o = oldValues?.[k]
        const n = newValues?.[k]
        const wasNull = o == null && oldValues == null
        const isInsert = oldValues == null
        const isDelete = newValues == null
        return (
          <div key={k} className="flex items-baseline gap-2">
            <span className="font-mono font-medium text-muted-foreground shrink-0 min-w-[100px]">
              {k}
            </span>
            <div className="flex flex-wrap items-baseline gap-1 min-w-0">
              {!isInsert && !wasNull && (
                <span className="px-1.5 py-0.5 rounded bg-destructive/10 text-destructive line-through truncate">
                  {fmtVal(o)}
                </span>
              )}
              {!isInsert && !isDelete && <span className="text-muted-foreground">→</span>}
              {!isDelete && (
                <span className="px-1.5 py-0.5 rounded bg-success/10 text-success truncate">
                  {fmtVal(n)}
                </span>
              )}
            </div>
          </div>
        )
      })}

      {!expanded && changed.length > meaningful.length && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(true)}
          className="h-6 text-xs"
        >
          <ChevronDown className="h-3 w-3" />
          عرض كل الحقول ({changed.length})
        </Button>
      )}
      {expanded && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(false)}
          className="h-6 text-xs"
        >
          <ChevronUp className="h-3 w-3" />
          إخفاء
        </Button>
      )}
    </div>
  )
}
