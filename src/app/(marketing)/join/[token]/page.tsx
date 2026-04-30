import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { JoinForm } from '@/components/marketing/join-form'
import { resolveJoinTokenAction } from '@/actions/joins'

export const metadata: Metadata = {
  title: 'الانضمام لعمارة',
  robots: { index: false, follow: false },
}

interface Props {
  params: Promise<{ token: string }>
}

/**
 * Public landing for /join/<rawToken>.
 *
 * Pattern (lessons #18 + #28): page never queries `building_join_links` directly.
 * Always goes through `resolveJoinTokenAction` server action → RPC with rate
 * limit + internal validation. The page only sees the success/error result.
 *
 * Flow:
 *   1. Visitor opens link admin shared (e.g., from WhatsApp).
 *   2. Page resolves token → if valid, shows JoinForm with building info.
 *   3. Visitor signs up → email confirm → /auth/callback → /join/finalize.
 *   4. /join/finalize calls submit_join_request RPC (server-only) → pending row.
 *   5. Admin approves from /apartments/pending.
 */
export default async function JoinPage({ params }: Props) {
  const { token } = await params
  const result = await resolveJoinTokenAction(token)

  if (!result.success) {
    return (
      <section className="py-16 md:py-20">
        <div className="mx-auto max-w-md px-4 md:px-6">
          <Card>
            <CardContent className="pt-8 pb-10 text-center">
              <div
                aria-hidden
                className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive"
              >
                <AlertCircle className="h-7 w-7" />
              </div>
              <h2 className="text-xl font-semibold mb-2">رابط غير صالح</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed mb-6">
                {result.error}
              </p>
              <Button asChild variant="outline">
                <Link href="/">العودة للرئيسية</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    )
  }

  return (
    <section className="py-12 md:py-16">
      <div className="mx-auto max-w-md px-4 md:px-6">
        <JoinForm
          rawToken={token}
          buildingName={result.buildingName}
          city={result.city}
        />
      </div>
    </section>
  )
}
