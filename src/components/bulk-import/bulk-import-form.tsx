'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, AlertCircle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  importApartmentsAction,
  importMembersAction,
} from '@/actions/bulk-import'

type Result = {
  success: true
  jobId: string
  rowsTotal: number
  rowsSucceeded: number
  rowsFailed: number
  errors: { row: number; error: string }[]
}

interface Props {
  type: 'apartments' | 'members'
  /** Sample column names for the help text. */
  sampleHeader: string
  /** Short description of expected columns. */
  description: string
  /** Where to redirect after a successful import. */
  redirectAfter: string
}

export function BulkImportForm({
  type,
  sampleHeader,
  description,
  redirectAfter,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)

  function onSubmit(formData: FormData) {
    setResult(null)
    setError(null)
    startTransition(async () => {
      const action =
        type === 'apartments' ? importApartmentsAction : importMembersAction
      const res = await action(formData)
      if (res.success) {
        setResult(res)
        if (res.rowsFailed === 0) {
          toast.success(`تم استيراد ${res.rowsSucceeded} صف بنجاح`)
        } else {
          toast.warning(
            `فشل ${res.rowsFailed} صف من ${res.rowsTotal} — راجع التفاصيل`,
          )
        }
        if (res.rowsFailed === 0) {
          // Brief delay so user sees the success summary before refresh
          setTimeout(() => router.push(redirectAfter), 1500)
        }
      } else {
        setError(res.error)
        toast.error(res.error)
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>رفع ملف للاستيراد</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={onSubmit} className="space-y-5" noValidate>
          <div className="rounded-md bg-muted/50 p-4 text-sm">
            <p className="font-medium">الأعمدة المَطلوبة:</p>
            <p
              className="mt-1 font-mono text-xs text-muted-foreground"
              dir="ltr"
            >
              {sampleHeader}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">{description}</p>
          </div>

          <div>
            <Label htmlFor="file">الملف (CSV بترميز UTF-8، حد أقصى 10MB / 1000 صف)</Label>
            <Input
              id="file"
              name="file"
              type="file"
              accept=".csv,text/csv,application/csv"
              required
              disabled={isPending}
              dir="ltr"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              الصف الأول هو عناوين الأعمدة. لو الملف Excel، احفظه كـ CSV
              (UTF-8) من Excel: ملف ← حفظ باسم ← CSV. كل خلية تَبدأ بـ ={'+'}-{'@'}
              ستُرفض (حماية من CSV injection).
            </p>
          </div>

          <Button type="submit" loading={isPending} className="w-full">
            <Upload className="h-4 w-4" />
            رفع وتَنفيذ الاستيراد
          </Button>
        </form>

        {error && (
          <div className="mt-6 rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {result && (
          <div className="mt-6 space-y-4">
            <div
              className={`rounded-md border p-4 text-sm flex items-start gap-2 ${
                result.rowsFailed === 0
                  ? 'border-green-500/30 bg-green-500/10 text-green-900 dark:text-green-300'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-300'
              }`}
            >
              {result.rowsFailed === 0 ? (
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              )}
              <div>
                <p className="font-medium">
                  {result.rowsFailed === 0
                    ? `تم استيراد ${result.rowsSucceeded} صف بنجاح`
                    : `فشل ${result.rowsFailed} صف — لم يَتم استيراد أي صف (atomic rollback)`}
                </p>
                <p className="mt-1 text-xs opacity-80">
                  المَجموع: {result.rowsTotal} صف، نَجح: {result.rowsSucceeded}،
                  فَشل: {result.rowsFailed}
                </p>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="rounded-md border border-border bg-card">
                <div className="border-b border-border px-4 py-2 font-medium text-sm">
                  أخطاء الصفوف ({result.errors.length})
                </div>
                <ul className="max-h-60 overflow-y-auto divide-y divide-border text-xs">
                  {result.errors.slice(0, 50).map((e, idx) => (
                    <li key={idx} className="px-4 py-2">
                      <span className="font-medium">صف {e.row}:</span>{' '}
                      <span className="text-muted-foreground">{e.error}</span>
                    </li>
                  ))}
                </ul>
                {result.errors.length > 50 && (
                  <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
                    + {result.errors.length - 50} خطأ إضافي
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
