import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Auth callback: exchanges Supabase recovery / signup-confirmation codes
 * for a real session, then redirects the user to `next` (default /dashboard).
 *
 * Supabase email links land here as:
 *   /auth/callback?code=<pkce-code>&next=/reset-password
 * Or for OTP-style flows:
 *   /auth/callback?token_hash=<hash>&type=recovery&next=/reset-password
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)

  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const rawNext = searchParams.get('next') ?? '/dashboard'

  // Only accept relative redirects to avoid open-redirect.
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard'

  const supabase = await createClient()

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  } else if (tokenHash && type) {
    // OTP-style verification (recovery, magiclink, signup, invite, etc.)
    const { error } = await supabase.auth.verifyOtp({
      // type from Supabase email is one of: 'signup' | 'recovery' | 'invite' | 'magiclink' | 'email_change'
      type: type as 'signup' | 'recovery' | 'invite' | 'magiclink' | 'email_change',
      token_hash: tokenHash,
    })
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent('رابط المصادقة غير صالح أو انتهت صلاحيته')}`,
  )
}
