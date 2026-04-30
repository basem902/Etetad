import type { LucideIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export interface StatsCardProps {
  label: string
  value: string | number | null
  icon: LucideIcon
  description?: string
  trend?: {
    label: string
    variant?: 'default' | 'success' | 'warning' | 'destructive' | 'secondary' | 'outline'
  }
  emphasizeNegative?: boolean
  className?: string
}

export function StatsCard({
  label,
  value,
  icon: Icon,
  description,
  trend,
  emphasizeNegative,
  className,
}: StatsCardProps) {
  const numericValue = typeof value === 'string' ? Number(value.replace(/[^\d.-]/g, '')) : value
  const isNegative = emphasizeNegative && typeof numericValue === 'number' && numericValue < 0

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            'text-2xl font-bold tabular-nums',
            isNegative && 'text-destructive',
          )}
        >
          {value ?? '—'}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
          {trend && (
            <Badge variant={trend.variant ?? 'secondary'} className="text-[10px]">
              {trend.label}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function StatsCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4 rounded" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-2 h-3 w-40" />
      </CardContent>
    </Card>
  )
}
