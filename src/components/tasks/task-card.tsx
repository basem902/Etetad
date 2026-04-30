'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Calendar, User } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDate } from '@/lib/format'
import { updateTaskStatusAction } from '@/actions/tasks'
import { TASK_STATUSES } from '@/lib/validations/tasks'
import type { TaskStatus, TaskPriority } from '@/types/database'
import type { TaskRow } from '@/lib/queries/tasks'

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'للقيام',
  in_progress: 'قيد التنفيذ',
  waiting_external: 'بانتظار خارجي',
  completed: 'مكتمل',
  overdue: 'متأخر',
}

const PRIORITY_CFG: Record<
  TaskPriority,
  { label: string; variant: 'secondary' | 'warning' | 'destructive' }
> = {
  low: { label: 'منخفضة', variant: 'secondary' },
  medium: { label: 'متوسطة', variant: 'secondary' },
  high: { label: 'عالية', variant: 'warning' },
}

interface Props {
  task: TaskRow
  /** When true, the current user is allowed to update the status. */
  canUpdate: boolean
}

export function TaskCard({ task, canUpdate }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onStatusChange(value: string) {
    if (value === task.status) return
    const fd = new FormData()
    fd.set('task_id', task.id)
    fd.set('status', value)
    startTransition(async () => {
      const r = await updateTaskStatusAction(fd)
      if (r.success) {
        toast.success(r.message ?? 'تم التحديث')
        router.refresh()
      } else {
        toast.error(r.error)
      }
    })
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h4 className="font-medium text-sm truncate">{task.title}</h4>
            {task.description && (
              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                {task.description}
              </p>
            )}
          </div>
          <Badge variant={PRIORITY_CFG[task.priority].variant}>
            {PRIORITY_CFG[task.priority].label}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {task.due_date && (
            <span
              className={`flex items-center gap-1 ${task.is_overdue ? 'text-destructive font-medium' : ''}`}
            >
              {task.is_overdue ? (
                <AlertTriangle className="h-3 w-3" />
              ) : (
                <Calendar className="h-3 w-3" />
              )}
              {formatDate(task.due_date)}
            </span>
          )}
          {task.assignee_name && (
            <span className="flex items-center gap-1 truncate">
              <User className="h-3 w-3" />
              {task.assignee_name}
            </span>
          )}
          {task.is_overdue && (
            <Badge variant="destructive" className="text-[10px] py-0">
              متأخر
            </Badge>
          )}
        </div>

        {canUpdate ? (
          <Select
            value={task.status}
            onValueChange={onStatusChange}
            disabled={isPending}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="text-xs text-muted-foreground">
            {STATUS_LABELS[task.status]}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
