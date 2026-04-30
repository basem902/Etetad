import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { ContactForm } from '@/components/marketing/contact-form'
import type { PricingTier } from '@/components/marketing/pricing-cards'

export const metadata: Metadata = {
  title: 'تواصل معنا — إدارة العمارة',
  description:
    'تواصل مع فريق إدارة العمارة لإكمال خطوات الاشتراك أو لأي استفسار.',
  alternates: { canonical: '/contact' },
}

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

export default async function ContactPage() {
  const tiers = await getTiers()

  return (
    <section className="py-16 md:py-20">
      <div className="mx-auto max-w-2xl px-4 md:px-6">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            تواصل معنا
          </h1>
          <p className="mt-3 text-lg text-muted-foreground">
            عبِّئ النموذج وسنَتواصل معك خلال 24 ساعة.
          </p>
        </div>

        <ContactForm tiers={tiers} />
      </div>
    </section>
  )
}
