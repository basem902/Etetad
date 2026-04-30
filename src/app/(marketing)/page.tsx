import type { Metadata } from 'next'
import { Hero } from '@/components/marketing/hero'
import { FeaturesGrid } from '@/components/marketing/features-grid'
import { CtaBanner } from '@/components/marketing/cta-banner'

export const metadata: Metadata = {
  title: 'إدارة العمارة — منصة شفافة لإدارة العمارات السكنية',
  description:
    'منصة عربية متعدِّدة المستأجرين لإدارة العمارات السكنية. مدفوعات، صيانة، تصويتات، وتقارير في مكان واحد. ابدأ تجربتك المجانية اليوم.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'إدارة العمارة',
    description:
      'منصة شفافة لإدارة العمارات السكنية. مدفوعات + صيانة + تصويتات + تقارير.',
    type: 'website',
    locale: 'ar_SA',
    url: '/',
  },
}

/**
 * Landing page — public, no auth required.
 * Layout (header + footer) provided by (marketing)/layout.tsx.
 *
 * Logged-in users still see the landing here (they can navigate to
 * /dashboard via the header or by visiting the URL directly).
 */
export default function MarketingHomePage() {
  return (
    <>
      <Hero />
      <FeaturesGrid />
      <CtaBanner />
    </>
  )
}
