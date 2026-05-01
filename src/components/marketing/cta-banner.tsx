import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Banner final للـ landing — يُذكِّر الزائر بالـ CTA قبل الـ footer.
 */
export function CtaBanner() {
  return (
    <section className="border-b border-border bg-gradient-to-br from-primary/10 via-background to-primary/5">
      <div className="mx-auto max-w-4xl px-4 py-16 md:px-6 md:py-20 text-center">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
          جاهز لرقمنة إدارة عمارتك؟
        </h2>
        <p className="mt-4 text-lg text-muted-foreground">
          ابدأ اشتراكك اليوم. تَفعيل خلال ساعات بعد التَحويل البَنكي.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="lg" asChild>
            <Link href="/subscribe?tier=pro&cycle=yearly">
              ابدأ اشتراكك
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/contact">تواصل معنا</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
