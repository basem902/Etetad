import type { ReactNode } from 'react'
import { MarketingHeader } from '@/components/marketing/marketing-header'
import { MarketingFooter } from '@/components/marketing/marketing-footer'

/**
 * (marketing) route group — public landing surface for unauthenticated visitors.
 *
 * Different from (app) layout (no AppShell, no auth gate) and from (super-admin)
 * layout (no super_admin gate). Pure marketing — anyone can land here.
 *
 * Logged-in users CAN visit /pricing, /contact too (e.g., to upgrade or contact
 * support). The middleware does NOT redirect /, /pricing, /contact when
 * authenticated (Phase 16 design).
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  )
}
