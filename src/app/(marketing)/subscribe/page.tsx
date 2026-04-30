import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SubscribeForm } from '@/components/subscriptions/subscribe-form'
import { RenewForm } from '@/components/subscriptions/renew-form'
import { createClient } from '@/lib/supabase/server'
import { hasRole, isSuperAdmin } from '@/lib/permissions'

export const metadata: Metadata = {
  title: 'الاشتراك بـ تَحويل بنكي',
  robots: { index: false, follow: false },
}

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function SubscribePage({ searchParams }: Props) {
  const sp = await searchParams
  const single = (k: string): string | undefined => {
    const v = sp[k]
    return Array.isArray(v) ? v[0] : v
  }

  const isRenew = single('renew') === 'true'
  const buildingIdParam = single('building')

  // Phase 19: renewal flow — authenticated admin of the building.
  if (isRenew && buildingIdParam) {
    // UUID format check (defense — RPC also validates)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(buildingIdParam)) {
      redirect('/subscribe')
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      redirect(
        `/login?next=${encodeURIComponent(
          `/subscribe?renew=true&building=${buildingIdParam}`,
        )}`,
      )
    }

    const allowed =
      (await isSuperAdmin(user.id)) ||
      (await hasRole(buildingIdParam, ['admin'], user.id))
    if (!allowed) redirect('/forbidden')

    const { data: bldg } = await supabase
      .from('buildings')
      .select('id, name, subscription_plan, subscription_ends_at')
      .eq('id', buildingIdParam)
      .maybeSingle()

    if (!bldg) redirect('/forbidden')

    return (
      <section className="py-12 md:py-16">
        <div className="mx-auto max-w-2xl px-4 md:px-6">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
              تجديد اشتراك العمارة
            </h1>
            <p className="mt-3 text-muted-foreground">
              اختر الباقة المناسبة، حوِّل المبلغ بنكياً، وارفع الإيصال. لن
              تَتأثَّر خدمتك الحالية حتى يَتم اعتماد الدفع.
            </p>
          </div>

          <RenewForm
            buildingId={bldg.id}
            buildingName={bldg.name}
            currentTier={bldg.subscription_plan as string}
            currentEndsAt={bldg.subscription_ends_at}
          />
        </div>
      </section>
    )
  }

  // Default: anon new-subscription flow
  const tier = single('tier') ?? 'pro'
  const cycle = single('cycle') === 'monthly' ? 'monthly' : 'yearly'

  return (
    <section className="py-12 md:py-16">
      <div className="mx-auto max-w-2xl px-4 md:px-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            اشترك في إدارة العمارة
          </h1>
          <p className="mt-3 text-muted-foreground">
            عبّئ بياناتك، حوِّل المبلغ بنكياً، وارفع الإيصال. نُراجعه خلال 24
            ساعة ونَفتح حسابك تلقائياً.
          </p>
        </div>

        <SubscribeForm initialTier={tier} initialCycle={cycle} />
      </div>
    </section>
  )
}
