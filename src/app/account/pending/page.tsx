import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Clock, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ThemeToggle } from '@/components/theme-toggle'
import { formatRelative } from '@/lib/format'

export const metadata: Metadata = {
  title: 'بانتظار التَفعيل',
  robots: { index: false, follow: false },
}

/**
 * Standalone page (outside (app) group — no AppShell, no building check).
 *
 * Shown to authenticated users who:
 *   - Have no active building_memberships (zero buildings via getUserBuildings)
 *   - Have at least one pending_apartment_members row with status='pending'
 *
 * If they have memberships → redirect to /dashboard (don't show stale state).
 * If they have no pending → redirect to /onboarding (start fresh).
 */
export default async function AccountPendingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Active membership? Skip pending screen.
  const { data: memberships } = await supabase
    .from('building_memberships')
    .select('building_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)
  if (memberships && memberships.length > 0) {
    redirect('/dashboard')
  }

  // Fetch pending requests for this user (joined with building name for display)
  const { data: pending } = await supabase
    .from('pending_apartment_members')
    .select('id, building_id, status, requested_apartment_number, created_at, rejection_reason')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  // v0.20: also fetch pending subscription orders (new building admin path)
  const { data: pendingSubs } = await supabase.rpc(
    'get_my_pending_subscription_orders',
  )

  // v0.21: also fetch pending contact requests (trial/enterprise — option D)
  const { data: pendingContacts } = await supabase.rpc(
    'get_my_pending_contact_requests',
  )

  // No pending of any kind → onboarding
  if (
    (!pending || pending.length === 0) &&
    (!pendingSubs || pendingSubs.length === 0) &&
    (!pendingContacts || pendingContacts.length === 0)
  ) {
    redirect('/onboarding')
  }

  // Fetch building names (separate query — RLS allows pending users to read
  // buildings they have a pending request for via the SELECT policy on buildings)
  const pendingArr = pending ?? []
  const buildingIds = Array.from(new Set(pendingArr.map((p) => p.building_id)))
  const { data: buildings } = buildingIds.length
    ? await supabase
        .from('buildings')
        .select('id, name, city')
        .in('id', buildingIds)
    : { data: [] as { id: string; name: string; city: string | null }[] | null }
  const buildingMap = new Map(
    (buildings ?? []).map((b) => [b.id, { name: b.name, city: b.city }] as const),
  )

  const activePending = pendingArr.find((p) => p.status === 'pending')
  const rejected = pendingArr.filter((p) => p.status === 'rejected')

  // v0.20: pending subscription order(s) — building admin awaiting super_admin
  // approval. Show the most recent one (typically there's only one in flight
  // since create_renewal_order blocks duplicates, but new orders can chain
  // after a terminal rejection).
  const pendingSubsArr = pendingSubs ?? []
  const activeSubOrder = pendingSubsArr.find(
    (s) =>
      s.status === 'awaiting_payment' ||
      s.status === 'awaiting_review' ||
      s.status === 'provisioning' ||
      s.status === 'provisioning_failed',
  )
  const rejectedSubOrder = pendingSubsArr.find((s) => s.status === 'rejected')

  // v0.21: pending contact request (option D — trial/enterprise)
  const pendingContactsArr = pendingContacts ?? []
  const activeContactRequest = pendingContactsArr[0]

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4 md:px-6">
          <Link href="/" className="font-bold tracking-tight">
            إدارة العمارة
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <form
              action={async () => {
                'use server'
                const supa = await createClient()
                await supa.auth.signOut()
                redirect('/login')
              }}
            >
              <Button variant="ghost" size="sm" type="submit">
                <LogOut className="h-4 w-4" />
                خروج
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-12 md:px-6 md:py-16">
        <div className="mx-auto max-w-2xl space-y-6">
          {activeContactRequest ? (
            <Card>
              <CardContent className="pt-8 pb-10 text-center">
                <div
                  aria-hidden
                  className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-warning/10 text-warning"
                >
                  <Clock className="h-7 w-7" />
                </div>
                <h2 className="text-xl font-semibold mb-2">
                  طَلب التَواصل بانتظار المُراجعة
                </h2>
                <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                  طَلبك لـ{' '}
                  <strong>{activeContactRequest.building_name}</strong>{' '}
                  بانتظار مُراجعة إدارة المنصة. سَنَتَواصل مَعك قَريباً عبر
                  بَريدك أو رَقم جَوالك.
                </p>
                {activeContactRequest.interested_tier === 'trial' && (
                  <p className="text-xs text-muted-foreground mt-3">
                    باقة التَجربة المَجانية (30 يوم) — تُفعَّل بعد التَأكُّد من
                    البَيانات.
                  </p>
                )}
                {activeContactRequest.interested_tier === 'enterprise' && (
                  <p className="text-xs text-muted-foreground mt-3">
                    باقة المؤسسات — مُحادَثة شَخصية لتَحديد الأسعار + التَفاصيل.
                  </p>
                )}
                {activeContactRequest.status === 'contacted' && (
                  <p className="text-xs text-muted-foreground mt-3">
                    تَواصلنا مَعك بالفعل. اطَّلِع على بَريدك للتَفاصيل.
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-4">
                  أُرسل الطلب {formatRelative(activeContactRequest.created_at)}.
                </p>
              </CardContent>
            </Card>
          ) : null}

          {activeSubOrder ? (
            <Card>
              <CardContent className="pt-8 pb-10 text-center">
                <div
                  aria-hidden
                  className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-warning/10 text-warning"
                >
                  <Clock className="h-7 w-7" />
                </div>
                <h2 className="text-xl font-semibold mb-2">
                  طَلب الاشتراك بانتظار الاعتماد
                </h2>
                <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                  طَلب اشتراك عمارة{' '}
                  <strong>{activeSubOrder.building_name}</strong> بانتظار مُراجعة
                  إدارة المنصة.
                </p>
                <p className="text-xs text-muted-foreground mt-3">
                  رقم المرجع:{' '}
                  <span className="font-mono">
                    {activeSubOrder.reference_number}
                  </span>
                </p>
                {activeSubOrder.status === 'awaiting_payment' && (
                  <p className="text-xs text-muted-foreground mt-2">
                    لم نَستلم إيصال التَحويل بَعد. تَفقَّد بَريدك للحصول على
                    تَفاصيل الحساب البَنكي ورابط رَفع الإيصال.
                  </p>
                )}
                {activeSubOrder.status === 'awaiting_review' && (
                  <p className="text-xs text-muted-foreground mt-2">
                    تم استلام الإيصال. عادةً نَرد خلال 24 ساعة.
                  </p>
                )}
                {activeSubOrder.status === 'provisioning' && (
                  <p className="text-xs text-muted-foreground mt-2">
                    تم اعتماد دَفعتك — جارٍ تَجهيز عمارتك. أَعِد المُحاولة بعد
                    قَليل.
                  </p>
                )}
                {activeSubOrder.status === 'provisioning_failed' && (
                  <p className="text-xs text-destructive mt-2">
                    تَعذَّرت العَملية تقنياً. تَواصل مع إدارة المنصة لإعادة
                    المُحاولة.
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-4">
                  أُرسل الطلب {formatRelative(activeSubOrder.created_at)}.
                </p>
              </CardContent>
            </Card>
          ) : null}

          {rejectedSubOrder && !activeSubOrder ? (
            <Card>
              <CardContent className="pt-6 pb-6">
                <h3 className="font-semibold mb-2">طلب اشتراك سابق مَرفوض</h3>
                <p className="text-sm text-muted-foreground">
                  رقم المرجع:{' '}
                  <span className="font-mono">
                    {rejectedSubOrder.reference_number}
                  </span>
                </p>
                {rejectedSubOrder.rejection_reason && (
                  <p className="text-sm text-muted-foreground mt-2 border-r-2 border-destructive pr-3">
                    السبب: {rejectedSubOrder.rejection_reason}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-3">
                  يُمكنك التَواصل مَع إدارة المنصة أو إعادة التَقديم.
                </p>
              </CardContent>
            </Card>
          ) : null}

          {activePending ? (
            <Card>
              <CardContent className="pt-8 pb-10 text-center">
                <div
                  aria-hidden
                  className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-warning/10 text-warning"
                >
                  <Clock className="h-7 w-7" />
                </div>
                <h2 className="text-xl font-semibold mb-2">بانتظار التَفعيل</h2>
                <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                  طلب الانضمام إلى{' '}
                  <strong>
                    {buildingMap.get(activePending.building_id)?.name ?? 'عمارتك'}
                  </strong>{' '}
                  بانتظار موافقة الإدارة.
                </p>
                {activePending.requested_apartment_number && (
                  <p className="text-xs text-muted-foreground mt-2">
                    رقم الشقة المُدَّعى: {activePending.requested_apartment_number}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-4">
                  أُرسل الطلب {formatRelative(activePending.created_at)}. تَأكَّد من أن
                  بريدك الإلكتروني مُفعَّل لتَستلم إشعار التَفعيل.
                </p>
              </CardContent>
            </Card>
          ) : null}

          {rejected.length > 0 && (
            <Card>
              <CardContent className="pt-6 pb-6">
                <h3 className="font-semibold mb-3">طلبات سابقة مرفوضة</h3>
                <ul className="space-y-3">
                  {rejected.map((r) => (
                    <li key={r.id} className="text-sm border-r-2 border-destructive pr-3">
                      <div className="font-medium">
                        {buildingMap.get(r.building_id)?.name ?? '—'}
                      </div>
                      {r.rejection_reason && (
                        <div className="text-muted-foreground text-xs mt-1">
                          السبب: {r.rejection_reason}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {!activeSubOrder && (
            <p className="text-center text-xs text-muted-foreground">
              تأكَّد من أن بَريدك مُفعَّل لتَستلم إشعار الموافَقة. لو لديك
              استفسار، تَواصل مَع إدارة المنصة.
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
