import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/server'
import { finalizeJoinRequestAction } from '@/actions/joins'

export const metadata: Metadata = {
  title: 'إكمال طلب الانضمام',
  robots: { index: false, follow: false },
}

/**
 * Step 2 of /join flow — runs after Supabase email confirmation lands the
 * user in /auth/callback?next=/join/finalize.
 *
 * The page is a server component that:
 *   1. Verifies the user is authenticated (else → /login).
 *   2. Calls finalizeJoinRequestAction (which reads pending_join_* metadata
 *      and submits the RPC via admin client).
 *   3. On success → /account/pending (next step in user journey).
 *   4. On failure → shows error with guidance.
 *
 * NOTE: this page MUST be a server-side render that runs the action once.
 * If the user refreshes, the metadata is already cleared on success — the
 * second call returns "no pending join data" which we redirect from.
 */
export default async function JoinFinalizePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // If the user already has a pending row for any building, skip submission
  // (idempotent). This handles the refresh case.
  const { data: existing } = await supabase
    .from('pending_apartment_members')
    .select('id, status')
    .eq('user_id', user.id)
    .in('status', ['pending'])
    .limit(1)
  if (existing && existing.length > 0) {
    redirect('/account/pending')
  }

  // If the user is now an active member of any building, redirect to dashboard
  const { data: memberships } = await supabase
    .from('building_memberships')
    .select('building_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)
  if (memberships && memberships.length > 0) {
    redirect('/dashboard')
  }

  // First-time landing here: run the finalize action
  const result = await finalizeJoinRequestAction()

  if (result.success) {
    return (
      <section className="py-16 md:py-20">
        <div className="mx-auto max-w-md px-4 md:px-6">
          <Card>
            <CardContent className="pt-8 pb-10 text-center">
              <div
                aria-hidden
                className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success"
              >
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h2 className="text-xl font-semibold mb-2">تم إرسال طلبك</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed mb-6">
                {result.message ??
                  'طلب الانضمام وَصل لإدارة العمارة. سَتَستلم بريداً عند الموافقة.'}
              </p>
              <Button asChild>
                <Link href="/account/pending">عرض حالة الطلب</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    )
  }

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
            <h2 className="text-xl font-semibold mb-2">تَعذَّر إكمال الطلب</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed mb-6">
              {result.error}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button asChild variant="outline">
                <Link href="/">العودة للرئيسية</Link>
              </Button>
              <Button asChild>
                <Link href="/contact">تواصل معنا</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
