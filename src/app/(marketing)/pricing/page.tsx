import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { PricingCards, type PricingTier } from '@/components/marketing/pricing-cards'
import { CtaBanner } from '@/components/marketing/cta-banner'

export const metadata: Metadata = {
  title: 'الباقات والأسعار — إدارة العمارة',
  description:
    'اختر الباقة التي تُناسب عمارتك. تجريبية مَجانية، أساسية، احترافية، أو مؤسسات.',
  alternates: { canonical: '/pricing' },
  openGraph: {
    title: 'الباقات والأسعار — إدارة العمارة',
    description: 'باقات تَبدأ من 49 SAR/شهر. تجربة مَجانية 30 يوماً.',
    type: 'website',
    locale: 'ar_SA',
    url: '/pricing',
  },
}

// Phase 16: tiers تُقرأ من DB عبر RPC `get_active_subscription_tiers`.
// is_active=true يُفلتر، sort_order يُرتِّب. تَعديل صف في SQL ينعكس فوراً.
async function getTiers(): Promise<PricingTier[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_active_subscription_tiers')
  if (error || !data) return []

  return data.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    price_monthly: t.price_monthly,
    price_yearly: t.price_yearly,
    max_apartments: t.max_apartments,
    max_admins: t.max_admins,
    features: Array.isArray(t.features) ? (t.features as string[]) : [],
    sort_order: t.sort_order,
  }))
}

export default async function PricingPage() {
  const tiers = await getTiers()

  return (
    <>
      <section className="border-b border-border py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
              باقات تُناسب كل عمارة
            </h1>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              ابدأ مَجاناً لمدة 30 يوماً. اختر الباقة المناسبة لاحقاً، وألغِ في أي وقت.
            </p>
          </div>

          {tiers.length > 0 ? (
            <PricingCards tiers={tiers} />
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              لا توجد باقات نشطة حالياً. تواصل معنا.
            </div>
          )}
        </div>
      </section>

      <CtaBanner />
    </>
  )
}
