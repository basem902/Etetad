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

  if (!pending || pending.length === 0) {
    redirect('/onboarding')
  }

  // Fetch building names (separate query — RLS allows pending users to read
  // buildings they have a pending request for via the SELECT policy on buildings)
  const buildingIds = Array.from(new Set(pending.map((p) => p.building_id)))
  const { data: buildings } = await supabase
    .from('buildings')
    .select('id, name, city')
    .in('id', buildingIds)
  const buildingMap = new Map(
    (buildings ?? []).map((b) => [b.id, { name: b.name, city: b.city }] as const),
  )

  const activePending = pending.find((p) => p.status === 'pending')
  const rejected = pending.filter((p) => p.status === 'rejected')

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

          <p className="text-center text-xs text-muted-foreground">
            أَو يُمكنك{' '}
            <Link href="/onboarding" className="text-primary hover:underline">
              تسجيل عمارتك الخاصة
            </Link>{' '}
            بدلاً من الانتظار.
          </p>
        </div>
      </main>
    </div>
  )
}
