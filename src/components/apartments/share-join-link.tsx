'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Link2, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { createJoinLinkAction } from '@/actions/joins'

interface Props {
  buildingId: string
}

/**
 * Admin-only button: generates a one-time-display join link for residents.
 * The raw token is shown ONCE (UI never reads it back from DB — only hash
 * is stored). After dialog closes, the admin must regenerate to get a
 * fresh link.
 */
export function ShareJoinLink({ buildingId }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [generated, setGenerated] = useState<{
    rawToken: string
    shareUrl: string
  } | null>(null)
  const [expiresInDays, setExpiresInDays] = useState('30')
  const [maxUses, setMaxUses] = useState('')

  function reset() {
    setGenerated(null)
    setExpiresInDays('30')
    setMaxUses('')
  }

  function handleGenerate() {
    const fd = new FormData()
    fd.set('building_id', buildingId)
    fd.set('expires_in_days', expiresInDays.trim())
    fd.set('max_uses', maxUses.trim())

    startTransition(async () => {
      const result = await createJoinLinkAction(fd)
      if (result.success) {
        setGenerated({ rawToken: result.rawToken, shareUrl: result.shareUrl })
        toast.success('تَم تَدوير الرابط — أي رابط قديم تَعَطَّل تلقائياً.')
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  async function copyToClipboard(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`تم نسخ ${label}`)
    } catch {
      toast.error('تَعذَّر النسخ — انسخ يدوياً.')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Share2 className="h-4 w-4" />
          رابط دعوة سكان
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تَدوير رابط دعوة السكان</DialogTitle>
          <DialogDescription>
            ولِّد رابطاً جديداً للمشاركة في WhatsApp group. الساكن يَفتحه ويُسجِّل،
            ثم يَنتظر مُوافقتك من قائمة الطلبات المُعلَّقة.
          </DialogDescription>
        </DialogHeader>

        {!generated ? (
          <div className="space-y-4">
            {/*
              Phase 17 round 3 (v3.36): rotation semantic — explicit warning so
              admin understands the new RPC behavior. The DB invalidates old
              links automatically (atomic UPDATE-then-INSERT in
              create_building_join_link). Without this UI note, admin might
              think old shared links still work.
            */}
            <div className="rounded-md border border-warning bg-warning/10 p-3 text-sm">
              ⚠️ توليد رابط جديد سيُعَطِّل **أي رابط سابق** لهذه العمارة فوراً.
              السكان الذين لم يَستخدموا الرابط القديم بَعد سيَحتاجون الجديد.
            </div>

            <div>
              <Label htmlFor="expires_in_days">تَنتهي صلاحيته بعد (أيام)</Label>
              <Input
                id="expires_in_days"
                type="number"
                min={1}
                max={365}
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
                disabled={isPending}
                placeholder="30"
                dir="ltr"
              />
              <p className="text-xs text-muted-foreground mt-1">
                اتركه فارغاً لرابط دائم (غير مُوصى به).
              </p>
            </div>

            <div>
              <Label htmlFor="max_uses">الحد الأقصى للاستخدامات</Label>
              <Input
                id="max_uses"
                type="number"
                min={1}
                max={10000}
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                disabled={isPending}
                placeholder="مثلاً 20"
                dir="ltr"
              />
              <p className="text-xs text-muted-foreground mt-1">
                اتركه فارغاً لاستخدامات غير محدودة.
              </p>
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" disabled={isPending}>
                  إلغاء
                </Button>
              </DialogClose>
              <Button onClick={handleGenerate} loading={isPending}>
                <Link2 className="h-4 w-4" />
                تَدوير وإنشاء رابط جديد
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border border-warning bg-warning/10 p-3 text-sm">
              ⚠️ احفظ هذا الرابط الآن — لن يَظهر مرة أخرى. أي رابط سابق صار
              مُعَطَّلاً تلقائياً (rotation تَم).
            </div>

            <div>
              <Label>رابط الانضمام</Label>
              <div className="flex gap-2">
                <Input
                  value={generated.shareUrl}
                  readOnly
                  dir="ltr"
                  className="font-mono text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => copyToClipboard(generated.shareUrl, 'الرابط')}
                  aria-label="نسخ الرابط"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                شارك هذا الرابط في WhatsApp group لسكان عمارتك.
              </p>
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button>تَم</Button>
              </DialogClose>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
