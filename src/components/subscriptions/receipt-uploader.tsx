'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileCheck2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  orderId: string
  rawToken: string
}

const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
])
const MAX_SIZE_MB = 5

export function ReceiptUploader({ orderId, rawToken }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [file, setFile] = useState<File | null>(null)
  const [transferDate, setTransferDate] = useState(
    new Date().toISOString().slice(0, 10),
  )
  const [transferReference, setTransferReference] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) {
      setFile(null)
      return
    }
    if (!ALLOWED_MIMES.has(f.type)) {
      toast.error('نَوع الملف غير مَدعوم. JPG/PNG/WEBP/PDF فقط.')
      e.target.value = ''
      return
    }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(`الملف أكبر من ${MAX_SIZE_MB}MB.`)
      e.target.value = ''
      return
    }
    setFile(f)
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) {
      toast.error('اختر ملف الإيصال أولاً.')
      return
    }

    const formData = new FormData()
    formData.set('access_token', rawToken)
    formData.set('receipt', file)
    formData.set('transfer_date', transferDate)
    formData.set('transfer_reference', transferReference.trim())

    startTransition(async () => {
      const res = await fetch(`/api/subscriptions/${orderId}/receipt`, {
        method: 'POST',
        body: formData,
      })

      let payload: { success?: true; error?: string } = {}
      try {
        payload = await res.json()
      } catch {
        // ignore
      }

      if (res.ok && payload.success) {
        toast.success('تَم استلام الإيصال — سَنُراجعه خلال 24 ساعة.')
        router.push(`/subscribe/${orderId}/success`)
      } else {
        toast.error(payload.error ?? 'تَعذَّر رفع الإيصال. حاول مجدَّداً.')
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">رفع إيصال التحويل</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="receipt">صورة الإيصال *</Label>
            <Input
              ref={inputRef}
              id="receipt"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={onFileChange}
              disabled={isPending}
              required
            />
            {file && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-success">
                <FileCheck2 className="h-3.5 w-3.5" />
                <span>{file.name}</span>
                <span className="text-muted-foreground">
                  ({(file.size / 1024).toFixed(0)} KB)
                </span>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              JPG / PNG / WEBP / PDF — حتى {MAX_SIZE_MB}MB.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="transfer_date">
                تاريخ التحويل <span className="text-destructive">*</span>
              </Label>
              <Input
                id="transfer_date"
                type="date"
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                required
                disabled={isPending}
                dir="ltr"
              />
            </div>
            <div>
              <Label htmlFor="transfer_reference">
                مرجع البنك <span className="text-muted-foreground">(اختياري)</span>
              </Label>
              <Input
                id="transfer_reference"
                value={transferReference}
                onChange={(e) => setTransferReference(e.target.value)}
                maxLength={100}
                placeholder="مثلاً: FT26041234567"
                disabled={isPending}
                dir="ltr"
              />
            </div>
          </div>

          <Button type="submit" loading={isPending} className="w-full" disabled={!file}>
            <Upload className="h-4 w-4" />
            إرسال الإيصال للمُراجعة
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
