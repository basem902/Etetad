import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Hero section للـ landing — يَجذب الزائر في أول 3 ثوانٍ.
 * RTL + Tajawal + dark/light. الـ CTA الأساسية: "ابدأ تجربتك المجانية".
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-background via-background to-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground mb-6">
            <span className="size-1.5 rounded-full bg-success" />
            متاحة الآن — تجربة مجانية 30 يوماً
          </div>

          <h1 className="text-4xl font-bold tracking-tight md:text-6xl">
            إدارة عمارتك بشفافية كاملة
          </h1>

          <p className="mt-6 text-lg text-muted-foreground leading-relaxed md:text-xl">
            مدفوعات، صيانة، تصويتات، وتقارير — في مكان واحد.
            مَنصَّة عربية مصمَّمة خصيصاً للعمارات السكنية في المملكة.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/subscribe?tier=pro&cycle=yearly">
                ابدأ اشتراكك الآن
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/pricing">شاهد الباقات</Link>
            </Button>
          </div>

          <p className="mt-6 text-xs text-muted-foreground">
            بدون بطاقة ائتمان · بدون التزامات · إلغاء في أي وقت
          </p>
        </div>
      </div>
    </section>
  )
}
