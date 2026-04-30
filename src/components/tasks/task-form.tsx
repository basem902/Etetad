'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createTaskAction } from '@/actions/tasks'
import { TASK_PRIORITIES } from '@/lib/validations/tasks'
import type { TaskPriority } from '@/types/database'

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'منخفضة',
  medium: 'متوسطة',
  high: 'عالية',
}

const NO_ASSIGNEE = '__none__'

interface Props {
  assignees: { user_id: string; full_name: string | null; role: string }[]
}

export function TaskForm({ assignees }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [assignee, setAssignee] = useState<string>(NO_ASSIGNEE)

  function onSubmit(formData: FormData) {
    setError(null)
    formData.set('priority', priority)
    formData.set('assigned_to', assignee === NO_ASSIGNEE ? '' : assignee)
    startTransition(async () => {
      const r = await createTaskAction(formData)
      if (r.success) {
        toast.success(r.message ?? 'تم إنشاء المهمة')
        router.replace('/tasks')
        router.refresh()
      } else {
        setError(r.error)
        toast.error(r.error)
      }
    })
  }

  return (
    <form action={onSubmit} className="space-y-4" noValidate>
      <div>
        <Label htmlFor="title">عنوان المهمة</Label>
        <Input
          id="title"
          name="title"
          required
          minLength={2}
          maxLength={200}
          disabled={isPending}
          placeholder="مثلاً: تجديد عقد التنظيف"
        />
      </div>

      <div>
        <Label htmlFor="description">الوصف (اختياري)</Label>
        <Textarea
          id="description"
          name="description"
          rows={3}
          maxLength={2000}
          disabled={isPending}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="priority">الأولوية</Label>
          <Select
            value={priority}
            onValueChange={(v) => setPriority(v as TaskPriority)}
            disabled={isPending}
          >
            <SelectTrigger id="priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="due_date">تاريخ الاستحقاق (اختياري)</Label>
          <Input
            id="due_date"
            name="due_date"
            type="date"
            disabled={isPending}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="assigned_to">إسناد إلى (اختياري)</Label>
        <Select value={assignee} onValueChange={setAssignee} disabled={isPending}>
          <SelectTrigger id="assigned_to">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_ASSIGNEE}>بدون إسناد</SelectItem>
            {assignees.map((a) => (
              <SelectItem key={a.user_id} value={a.user_id}>
                {a.full_name ?? '—'} · {a.role}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" loading={isPending}>
          إنشاء المهمة
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={isPending}
        >
          إلغاء
        </Button>
      </div>
    </form>
  )
}
