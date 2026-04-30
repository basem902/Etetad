'use client'

import { useState } from 'react'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { TaskCard } from './task-card'
import { EmptyState } from '@/components/shared/empty-state'
import type { TaskStatus } from '@/types/database'
import type { TaskRow } from '@/lib/queries/tasks'

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'todo', label: 'للقيام' },
  { id: 'in_progress', label: 'قيد التنفيذ' },
  { id: 'waiting_external', label: 'بانتظار خارجي' },
  { id: 'completed', label: 'مكتمل' },
]

interface Props {
  tasks: TaskRow[]
  /** When true, the user can change task statuses (admin/committee or assignee). */
  canUpdate: boolean
  currentUserId: string
}

/**
 * Tasks board: 4-column kanban on md+, tabbed list on mobile.
 *   - On <md the user picks one status at a time → vertical card list.
 *   - On md+ all 4 columns visible side-by-side.
 *
 * Per-card status updates handled by TaskCard's inline Select (no drag-drop).
 */
export function TasksBoard({ tasks, canUpdate, currentUserId }: Props) {
  const [tab, setTab] = useState<TaskStatus>('todo')

  const grouped: Record<TaskStatus, TaskRow[]> = {
    todo: [],
    in_progress: [],
    waiting_external: [],
    completed: [],
    overdue: [], // not used as a column — overdue is a flag, not a stored status
  }
  for (const t of tasks) grouped[t.status]?.push(t)

  function canEditTask(t: TaskRow): boolean {
    return canUpdate || t.assigned_to === currentUserId
  }

  // ============= Mobile: tabs =============
  return (
    <>
      <div className="md:hidden">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TaskStatus)}>
          <TabsList className="grid w-full grid-cols-4">
            {COLUMNS.map((c) => (
              <TabsTrigger key={c.id} value={c.id} className="text-xs">
                {c.label}
                <span className="ms-1 text-muted-foreground">
                  ({grouped[c.id].length})
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
          {COLUMNS.map((c) => (
            <TabsContent key={c.id} value={c.id} className="space-y-2 pt-3">
              {grouped[c.id].length === 0 ? (
                <EmptyState
                  title={`لا توجد مهام في "${c.label}"`}
                  description=""
                  className="py-6"
                />
              ) : (
                grouped[c.id].map((t) => (
                  <TaskCard key={t.id} task={t} canUpdate={canEditTask(t)} />
                ))
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* ============= Desktop: 4-column kanban ============= */}
      <div className="hidden md:grid md:grid-cols-4 gap-3">
        {COLUMNS.map((c) => (
          <div key={c.id} className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm font-semibold">{c.label}</h3>
              <span className="text-xs text-muted-foreground tabular-nums">
                {grouped[c.id].length}
              </span>
            </div>
            <div className="space-y-2">
              {grouped[c.id].length === 0 ? (
                <div className="rounded-md border border-dashed border-border bg-muted/20 p-4 text-center text-xs text-muted-foreground">
                  لا توجد مهام
                </div>
              ) : (
                grouped[c.id].map((t) => (
                  <TaskCard key={t.id} task={t} canUpdate={canEditTask(t)} />
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
