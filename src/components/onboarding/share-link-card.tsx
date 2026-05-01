'use client'

import { useRouter } from 'next/navigation'
import { Copy, Share2, MessageCircle, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'

interface Props {
  buildingName: string
  totalApartments: number
  shareUrl: string
}

export function ShareLinkCard({
  buildingName,
  totalApartments,
  shareUrl,
}: Props) {
  const router = useRouter()

  const whatsappMessage =
    `أَهلاً جيران ${buildingName} 👋\n\n` +
    `أَنشَأنا حساباً لِلعمارة في "نظام إدارة العمارة" لِتَنظيم المَدفوعات والصيانة والتَصويتات.\n\n` +
    `سَجِّل بياناتك مِن هُنا:\n${shareUrl}\n\n` +
    `بَعد التَسجيل سَأُراجِع طَلَبَك وأَربِطُك بِشَقَّتِك.`

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      toast.success('تم نَسخ الرابط')
    } catch {
      toast.error('تَعذَّر النَسخ — انسَخ يَدَوياً.')
    }
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(whatsappMessage)
      toast.success('تم نَسخ نَص الرَسالة')
    } catch {
      toast.error('تَعذَّر النَسخ — انسَخ يَدَوياً.')
    }
  }

  async function nativeShare() {
    if (typeof navigator === 'undefined' || !navigator.share) {
      copyLink()
      return
    }
    try {
      await navigator.share({
        title: `انضَم إلى ${buildingName}`,
        text: whatsappMessage,
        url: shareUrl,
      })
    } catch {
      // user cancelled or sharing failed silently — no-op
    }
  }

  return (
    <Card className="w-full max-w-lg">
      <CardContent className="pt-6 space-y-5">
        <div className="text-center space-y-1">
          <div
            aria-hidden
            className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"
          >
            <Share2 className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-bold">جاهِزة! 🎉</h2>
          <p className="text-sm text-muted-foreground">
            تم إعداد <span className="font-semibold">{buildingName}</span> بِنَجاح
            ({totalApartments} شَقّة).
          </p>
          <p className="text-sm text-muted-foreground">
            انسَخ الرابط التالي وأَرسِله لِسُكّان العمارة في قُروب الواتساب.
          </p>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            رابط الدَعوة
          </label>
          <div className="flex gap-2">
            <Input
              value={shareUrl}
              readOnly
              dir="ltr"
              className="font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              size="icon"
              variant="outline"
              onClick={copyLink}
              aria-label="نَسخ الرابط"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            صالِح 30 يَوماً. السُكّان يَفتَحونه ويُسَجِّلون، ثُم تُوافِق عَلى
            طَلَباتهم مِن صَفحة الطَلبات المُعلَّقة.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button asChild className="bg-[#25D366] hover:bg-[#1ebe59] text-white">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="فَتح واتساب لِلمُشارَكة"
            >
              <MessageCircle className="h-4 w-4" />
              مُشارَكة عَبر واتساب
            </a>
          </Button>
          <Button variant="outline" onClick={copyMessage}>
            <Copy className="h-4 w-4" />
            نَسخ نَص الرَسالة
          </Button>
        </div>

        {typeof navigator !== 'undefined' && 'share' in navigator && (
          <Button variant="ghost" className="w-full" onClick={nativeShare}>
            <Share2 className="h-4 w-4" />
            مُشارَكة عَبر تَطبيقات أُخرى
          </Button>
        )}

        <div className="border-t border-border pt-4">
          <Button
            type="button"
            className="w-full"
            onClick={() => router.replace('/dashboard')}
          >
            ابدأ
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <p className="text-xs text-muted-foreground text-center mt-2">
            سَتَجِد الرابط مَرَّة أُخرى في صَفحة الشُقَق إذا احتَجت تَدويره.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
