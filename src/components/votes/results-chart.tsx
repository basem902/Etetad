'use client'

import { CheckCircle2, XCircle } from 'lucide-react'
import type { VoteResults } from '@/lib/voting'
import { formatPercent } from '@/lib/voting'

interface Props {
  results: VoteResults
  /** When true, show numeric counts (admin/closed view). When false, hide raw numbers. */
  showCounts?: boolean
}

/**
 * Bar-chart style results display. Built with simple HTML/CSS bars to avoid
 * pulling in recharts (smaller bundle, no JS dependency for static rendering).
 */
export function ResultsChart({ results, showCounts = true }: Props) {
  const max = Math.max(1, ...results.options.map((o) => o.count))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-md border border-border p-3 bg-muted/20">
          <div className="text-muted-foreground text-xs">شقق صوّتت</div>
          <div className="text-xl font-bold tabular-nums">
            {results.total_voted_apartments}
          </div>
        </div>
        <div className="rounded-md border border-border p-3 bg-muted/20">
          <div className="text-muted-foreground text-xs">شقق مؤهلة</div>
          <div className="text-xl font-bold tabular-nums">
            {results.total_eligible_apartments}
          </div>
        </div>
        <div className="rounded-md border border-border p-3 bg-muted/20">
          <div className="text-muted-foreground text-xs">نسبة الإقبال</div>
          <div className="text-xl font-bold tabular-nums">
            {formatPercent(results.turnout_ratio)}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {results.options.map((o) => {
          const widthPct = (o.count / max) * 100
          const isWinner = results.winning_option?.option_id === o.option_id
          return (
            <div key={o.option_id} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span
                  className={`font-medium ${isWinner ? 'text-primary' : ''}`}
                >
                  {o.label}
                  {isWinner && (
                    <span className="ms-1 text-xs text-primary">(الفائز)</span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {showCounts && (
                    <>
                      {o.count} {o.count === 1 ? 'شقة' : 'شقق'} ·{' '}
                    </>
                  )}
                  {o.percentage.toFixed(1)}%
                </span>
              </div>
              <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    isWinner ? 'bg-primary' : 'bg-muted-foreground/40'
                  }`}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {results.total_voted_apartments > 0 && (
        <div
          className={`rounded-md border p-3 text-sm flex items-center gap-2 ${
            results.passes_approval
              ? 'border-success/40 bg-success/5 text-success'
              : 'border-destructive/40 bg-destructive/5 text-destructive'
          }`}
        >
          {results.passes_approval ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          ) : (
            <XCircle className="h-5 w-5 shrink-0" />
          )}
          <div>
            {results.passes_approval ? (
              <p className="font-medium">
                التصويت تجاوز نسبة القبول المطلوبة (
                {formatPercent(results.required_threshold)}).
              </p>
            ) : (
              <p className="font-medium">
                التصويت لم يَتجاوز نسبة القبول المطلوبة (
                {formatPercent(results.required_threshold)}).
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
