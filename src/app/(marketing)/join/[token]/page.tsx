import type { Metadata } from 'next'
import Link from 'next/link'
import {
  AlertCircle,
  ShieldCheck,
  Vote,
  Wrench,
  Receipt,
  Lightbulb,
  MessagesSquare,
} from 'lucide-react'
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

  const benefits = [
    {
      icon: ShieldCheck,
      title: 'شفافية كاملة',
      desc: 'تَرى أين تُصرَف اشتراكاتك بالضبط، والمَبلغ المُتَبَقي.',
    },
    {
      icon: Vote,
      title: 'حق التَصويت',
      desc: 'صَوت واحد لكل شَقَّة في القَرارات المُهمَّة. لا تَكرار، لا تَزوير.',
    },
    {
      icon: Wrench,
      title: 'طَلب صيانة',
      desc: 'بَلِّغ عَن الأعطال، تَتبَّع حالة الإصلاح حتى الانتهاء.',
    },
    {
      icon: Receipt,
      title: 'مَدفوعاتك واضحة',
      desc: 'سَجِل كل المَبالغ المَدفوعة + الإيصالات في مَكان واحد.',
    },
    {
      icon: Lightbulb,
      title: 'اطرَح اقتراحاتك',
      desc: 'شارك أَفكارك لتَحسين العمارة، شاركه السكان وصوَّت عليه.',
    },
    {
      icon: MessagesSquare,
      title: 'تَواصل مُرَتَّب',
      desc: 'كل رسائل الإدارة في مَكان واحد، بدون مَجموعات WhatsApp فَوضوية.',
    },
  ]

  return (
    <section className="py-12 md:py-16">
      <div className="mx-auto max-w-3xl px-4 md:px-6 space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            انضم إلى {result.buildingName}
          </h1>
          <p className="text-sm text-muted-foreground">
            مَنصَّة شَفافة لإدارة عمارتك السَكنية
          </p>
        </div>

        {/* Benefits — 6 cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {benefits.map((b) => {
            const Icon = b.icon
            return (
              <div
                key={b.title}
                className="rounded-md border border-border bg-card p-4"
              >
                <div className="flex items-start gap-3">
                  <div
                    aria-hidden
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-medium text-sm leading-tight">
                      {b.title}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {b.desc}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="mx-auto max-w-md">
          <JoinForm
            rawToken={token}
            buildingName={result.buildingName}
            city={result.city}
          />
        </div>
      </div>
    </section>
  )
}
