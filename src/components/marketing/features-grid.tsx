import {
  Wallet,
  Wrench,
  Vote,
  FileText,
  ShieldCheck,
  Smartphone,
  type LucideIcon,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

interface Feature {
  icon: LucideIcon
  title: string
  description: string
}

const features: Feature[] = [
  {
    icon: Wallet,
    title: 'مالية شفافة',
    description:
      'مدفوعات شهرية بإيصالات + اعتماد admin، مصروفات بفواتير، تقارير شهرية وسنوية بالـ SAR.',
  },
  {
    icon: Wrench,
    title: 'صيانة منظَّمة',
    description:
      'طلبات بـ workflow كامل (8 حالات)، تَعيين فنيين، صور قبل/بعد، ربط بمصروفات.',
  },
  {
    icon: Vote,
    title: 'تصويتات عادلة',
    description:
      'اقتراحات + تصويتات بنظام "ممثل الشقة". privacy حقيقية — ما يُعرف من صوَّت إلا بعد الإغلاق.',
  },
  {
    icon: FileText,
    title: 'سجل تدقيق كامل',
    description:
      'كل تَغيير حسّاس مَوثَّق تلقائياً. غير قابل للتَعديل أو الحذف.',
  },
  {
    icon: ShieldCheck,
    title: 'أمن متعدِّد المستأجرين',
    description:
      'كل عمارة معزولة بـ Row Level Security من قاعدة البيانات. لا تَسرُّب بين العمارات.',
  },
  {
    icon: Smartphone,
    title: 'PWA + Offline',
    description:
      'تَطبيق قابل للتَثبيت على iOS/Android. صفحة "بدون اتصال" تَظهر عند انقطاع الشبكة.',
  },
]

export function FeaturesGrid() {
  return (
    <section className="border-b border-border py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="text-center mb-12 md:mb-16">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            كل ما تَحتاجه لإدارة عمارتك
          </h2>
          <p className="mt-3 text-lg text-muted-foreground max-w-2xl mx-auto">
            مَنصَّة كاملة بُنيت من الصفر للسوق السعودي. لا أدوات مُتفرِّقة.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <Card key={feature.title} className="h-full">
                <CardContent className="pt-6">
                  <div className="size-10 rounded-md bg-primary/10 text-primary flex items-center justify-center mb-4">
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <h3 className="font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}
