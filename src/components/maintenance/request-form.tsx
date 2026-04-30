'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileImage, X } from 'lucide-react'
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
import { createMaintenanceRequestAction } from '@/actions/maintenance'
import {
  ALLOWED_MAINTENANCE_MIMES,
  MAX_MAINTENANCE_IMAGE_SIZE,
} from '@/lib/storage'
import {
  MAINTENANCE_LOCATIONS,
  MAINTENANCE_PRIORITIES,
} from '@/lib/validations/maintenance'
import type {
  MaintenanceLocation,
  MaintenancePriority,
} from '@/types/database'

const LOCATION_LABELS: Record<MaintenanceLocation, string> = {
  apartment: 'داخل شقة',
  entrance: 'المدخل',
  elevator: 'المصعد',
  roof: 'السطح',
  parking: 'الموقف',
  other: 'أخرى',
}

const PRIORITY_LABELS: Record<MaintenancePriority, string> = {
  low: 'منخفضة',
  medium: 'متوسطة',
  high: 'عالية',
  urgent: 'عاجلة',
}

const NO_APT = '__none__'

interface Props {
  apartments: { id: string; number: string }[]
  defaultApartmentId?: string
}

export function RequestForm({ apartments, defaultApartmentId }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [location, setLocation] = useState<MaintenanceLocation>('apartment')
  const [priority, setPriority] = useState<MaintenancePriority>('medium')
  const [apartmentId, setApartmentId] = useState<string>(
    defaultApartmentId ?? (apartments[0]?.id ?? NO_APT),
  )
  const [pickedFile, setPickedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setFileError(null)
    if (!f) {
      setPickedFile(null)
      setPreviewUrl(null)
      return
    }
    if (f.size > MAX_MAINTENANCE_IMAGE_SIZE) {
      setFileError('الحجم يجب أن يكون أقل من 10 ميجا')
      e.target.value = ''
      return
    }
    if (!(ALLOWED_MAINTENANCE_MIMES as readonly string[]).includes(f.type)) {
      setFileError('JPG, PNG, WebP فقط')
      e.target.value = ''
      return
    }
    setPickedFile(f)
    setPreviewUrl(URL.createObjectURL(f))
  }

  function clearFile() {
    if (fileRef.current) fileRef.current.value = ''
    setPickedFile(null)
    setPreviewUrl(null)
    setFileError(null)
  }

  function onSubmit(formData: FormData) {
    setError(null)
    formData.set('location_type', location)
    formData.set('priority', priority)
    formData.set('apartment_id', apartmentId === NO_APT ? '' : apartmentId)
    startTransition(async () => {
      const result = await createMaintenanceRequestAction(formData)
      if (result.success) {
        toast.success(result.message ?? 'تم تسجيل الطلب')
        if ('data' in result && result.data?.id) {
          router.replace(`/maintenance/${result.data.id}`)
        } else {
          router.replace('/maintenance')
        }
        router.refresh()
      } else {
        setError(result.error)
        toast.error(result.error)
      }
    })
  }

  return (
    <form action={onSubmit} className="space-y-4" noValidate>
      <div>
        <Label htmlFor="title">عنوان الطلب</Label>
        <Input
          id="title"
          name="title"
          required
          minLength={2}
          maxLength={200}
          disabled={isPending}
          placeholder="مثلاً: تسرّب ماء في حمّام شقة 102"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="location_type">موقع المشكلة</Label>
          <Select
            value={location}
            onValueChange={(v) => setLocation(v as MaintenanceLocation)}
            disabled={isPending}
          >
            <SelectTrigger id="location_type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MAINTENANCE_LOCATIONS.map((l) => (
                <SelectItem key={l} value={l}>
                  {LOCATION_LABELS[l]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="priority">الأولوية</Label>
          <Select
            value={priority}
            onValueChange={(v) => setPriority(v as MaintenancePriority)}
            disabled={isPending}
          >
            <SelectTrigger id="priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MAINTENANCE_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {apartments.length > 0 && (
        <div>
          <Label htmlFor="apartment_id">الشقة (إن كانت داخل شقة محددة)</Label>
          <Select value={apartmentId} onValueChange={setApartmentId} disabled={isPending}>
            <SelectTrigger id="apartment_id">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_APT}>غير مرتبط بشقة</SelectItem>
              {apartments.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  شقة {a.number}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div>
        <Label htmlFor="description">الوصف (اختياري)</Label>
        <Textarea
          id="description"
          name="description"
          rows={3}
          maxLength={2000}
          disabled={isPending}
          placeholder="اشرح المشكلة بتفاصيل تساعد المراجِع والفني."
        />
      </div>

      <div>
        <Label htmlFor="before_image">صورة «قبل» (اختياري)</Label>
        <Input
          ref={fileRef}
          id="before_image"
          type="file"
          name="before_image"
          accept={ALLOWED_MAINTENANCE_MIMES.join(',')}
          onChange={handleFile}
          disabled={isPending}
          className="cursor-pointer"
        />

        {pickedFile && previewUrl && (
          <div className="mt-2 flex items-start gap-3 rounded-md border border-border p-3 bg-muted/30">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="معاينة الصورة"
              className="h-24 w-24 rounded-md object-cover border border-border"
            />
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate text-sm">{pickedFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {(pickedFile.size / 1024).toFixed(0)} كيلوبايت
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-1 -ms-2"
                onClick={clearFile}
                disabled={isPending}
              >
                <X className="h-3.5 w-3.5" />
                إزالة
              </Button>
            </div>
          </div>
        )}
        {fileError && <p className="text-sm text-destructive mt-1">{fileError}</p>}
        <p className="text-xs text-muted-foreground mt-1">
          <FileImage className="inline h-3 w-3" /> JPG/PNG/WebP — الحد الأقصى 10 ميجا.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" loading={isPending}>
          تسجيل الطلب
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
