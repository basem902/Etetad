import type { Metadata } from 'next'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'تم استلام الإيصال',
  robots: { index: false, follow: false },
}

export default function ReceiptSuccessPage() {
  return (
    <section className="py-16 md:py-20">
      <div className="mx-auto max-w-md px-4 md:px-6">
        <Card>
          <CardContent className="pt-8 pb-10 text-center">
            <div
              aria-hidden
              className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success"
            >
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-semibold mb-2">تم استلام الإيصال</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed mb-2">
              نُراجعه عادةً خلال 24 ساعة. ستَستلم بريداً بالنتيجة:
            </p>
            <ul className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed mb-6 mr-4 list-disc text-right">
              <li>عند الاعتماد: دعوة Supabase لإعداد كلمة مرورك + رابط الدخول.</li>
              <li>عند الرفض: السبب + رابط لإعادة رفع إيصال صحيح.</li>
            </ul>
            <Button asChild variant="outline">
              <Link href="/">العودة للرئيسية</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
