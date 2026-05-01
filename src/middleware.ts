import { NextResponse, type NextRequest } from 'next/server'
import {
  attachCookies,
  updateSession,
  type CookieToSet,
} from '@/lib/supabase/middleware'

const AUTH_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password']
// Auth routes that should remain accessible even with an active session.
// /reset-password requires a session (set by /auth/callback) and is the page
// where the user finalizes a password change after email link.
const AUTH_ROUTES_SESSION_OK = ['/reset-password']

// Paths that require building admin role (or super_admin). Middleware returns
// HTTP 403 via rewrite if the active-building role isn't admin.
const ADMIN_ONLY_PREFIXES = ['/apartments']

// Authenticated routes that must be reachable even if the user's active
// building has an inactive subscription — onboarding (so they can switch
// buildings) and the subscription-inactive notice itself.
const SUBSCRIPTION_BYPASS_PREFIXES = ['/onboarding']

const ACTIVE_BUILDING_COOKIE = 'active_building_id'

function startsWithAny(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Fully public — skip session check.
  // /auth/callback is the post-email-link handler and must be reachable
  // without a session (the user is mid-authentication).
  //
  // Phase 16: marketing routes (/, /pricing, /contact, /about) are public
  // landing surface. They have their own (marketing) layout.
  // sitemap.xml + robots.txt + manifest.webmanifest are SEO infra (also public).
  //
  // Phase 17: /join/* is the public resident-invite landing surface.
  //   - /join/[token] is anon (visitor opens admin's shared link)
  //   - /join/finalize requires auth (post-signup callback)
  //   - We allow them ALL through this gate; the (marketing) layout handles
  //     each variant. The submit_join_request RPC is server-only via admin
  //     client, so no anon table writes happen here.
  const isPublic =
    pathname === '/' ||
    pathname === '/pricing' ||
    pathname === '/contact' ||
    pathname === '/about' ||
    pathname === '/forbidden' ||
    pathname === '/subscription-inactive' ||
    pathname === '/sitemap.xml' ||
    pathname === '/robots.txt' ||
    pathname === '/manifest.webmanifest' ||
    // Phase 18: /subscribe and /subscribe/[id] are public landing pages.
    // Anon visitors fill the form (subscribe form) or upload a receipt
    // (subscribe/[id] with token in query). The renew=true variant
    // requires auth, but the page itself enforces that internally —
    // middleware just lets it through.
    pathname === '/subscribe' ||
    pathname.startsWith('/subscribe/') ||
    pathname.startsWith('/join/') ||
    pathname.startsWith('/auth/callback') ||
    pathname.startsWith('/api/public/')

  if (isPublic) return NextResponse.next({ request })

  const isAuthRoute = startsWithAny(pathname, AUTH_ROUTES)
  const isSessionFriendlyAuthRoute = startsWithAny(pathname, AUTH_ROUTES_SESSION_OK)
  const isSuperAdminRoute = pathname.startsWith('/super-admin')

  const { supabase, user, cookiesToSync } = await updateSession(request)

  // Logged in users on auth routes → dashboard,
  // EXCEPT routes that legitimately need a session (reset-password).
  if (user && isAuthRoute && !isSessionFriendlyAuthRoute) {
    return attachCookies(
      NextResponse.redirect(new URL('/dashboard', request.url)),
      cookiesToSync,
    )
  }

  // Not logged in + not auth route → /login
  if (!user) {
    if (isAuthRoute) {
      return attachCookies(NextResponse.next({ request }), cookiesToSync)
    }
    return attachCookies(
      NextResponse.redirect(new URL('/login', request.url)),
      cookiesToSync,
    )
  }

  // Super admin gate (explicit denial, not silent redirect)
  if (isSuperAdminRoute) {
    const { data } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('id', user.id)
      .maybeSingle()

    if (!data?.is_super_admin) {
      const url = request.nextUrl.clone()
      url.pathname = '/forbidden'
      return attachCookies(NextResponse.rewrite(url, { status: 403 }), cookiesToSync)
    }
  }

  // Subscription gate (Phase 14, hardened in rounds 2+3 against P1 issues)
  // ============================================================
  // For non-super-admin users on authenticated routes, check the active
  // building's subscription_status.
  //
  // Round 1 (initial Phase 14) bug: if `active_building_id` cookie pointed
  // to an expired/cancelled building, we rewrote to /subscription-inactive
  // unconditionally — even when the user had OTHER active-subscription
  // buildings. /onboarding → /dashboard → blocked → loop.
  //
  // Round 2 fix (Codex P1, subscription-aware): when the cookie points to
  // an inactive building but the user has another active-subscription
  // membership, switch the cookie (request + response, Phase 5 pattern) and
  // let the request through. Only if the user has ZERO active buildings do
  // we rewrite to /subscription-inactive.
  //
  // Round 3 fix (Codex P1, role-aware): the round-2 fallback picked the
  // OLDEST active membership regardless of role. Scenario: user has
  //   [A=expired, B=active resident, C=active admin]
  // hits /apartments. Round-2 auto-switches to B (oldest active), then the
  // admin-only gate below denies because B is resident. The user never
  // chose B explicitly — middleware did. Round-3 fix: when the path
  // requires admin (ADMIN_ONLY_PREFIXES), prefer an active membership where
  // role='admin'. Fall back to any active membership only if none exists
  // (then admin-only gate's 403 is legitimate — user has no active admin
  // building anywhere).
  //
  // super_admin and /onboarding bypass this check entirely.
  // ============================================================
  if (!startsWithAny(pathname, SUBSCRIPTION_BYPASS_PREFIXES)) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile?.is_super_admin) {
      const activeBuildingId = request.cookies.get(ACTIVE_BUILDING_COOKIE)?.value
      let cookieIsInactive = false

      if (activeBuildingId) {
        const { data: building } = await supabase
          .from('buildings')
          .select('subscription_status')
          .eq('id', activeBuildingId)
          .maybeSingle()

        cookieIsInactive =
          building?.subscription_status === 'expired' ||
          building?.subscription_status === 'cancelled'
      }

      if (cookieIsInactive) {
        // Round-3: path-aware role preference for the auto-switch target.
        const requiresAdmin = startsWithAny(pathname, ADMIN_ONLY_PREFIXES)

        // Try to switch to another active-subscription building this user
        // is a member of (preserves membership ordering = oldest first).
        // We need `role` for the round-3 admin preference.
        const { data: memberships } = await supabase
          .from('building_memberships')
          .select('building_id, role')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('created_at', { ascending: true })

        let switchedTo: string | null = null
        if (memberships && memberships.length > 0) {
          const buildingIds = memberships
            .map((m) => m.building_id)
            .filter((id) => id !== activeBuildingId)

          if (buildingIds.length > 0) {
            const { data: activeBuildings } = await supabase
              .from('buildings')
              .select('id')
              .in('id', buildingIds)
              .not('subscription_status', 'in', '(expired,cancelled)')

            const activeSet = new Set((activeBuildings ?? []).map((b) => b.id))

            // Walk memberships in their stable order; pick the first whose
            // building is in the active-subscription set. For admin-only
            // routes, FIRST scan for an admin membership in an active
            // building; only fall back to any-role if no active admin
            // exists (so the admin-only gate's 403 stays legitimate).
            let firstActive: { building_id: string; role: string } | undefined
            if (requiresAdmin) {
              firstActive = memberships.find(
                (m) => activeSet.has(m.building_id) && m.role === 'admin',
              )
            }
            firstActive ??= memberships.find((m) =>
              activeSet.has(m.building_id),
            )

            if (firstActive) {
              switchedTo = firstActive.building_id
            }
          }
        }

        if (switchedTo) {
          // Phase 5 cookie-propagation pattern:
          //   1. request.cookies.set → Server Components see the new value
          //      in the same request (via the final NextResponse.next).
          //   2. cookiesToSync.push → browser stores it for next requests.
          request.cookies.set(ACTIVE_BUILDING_COOKIE, switchedTo)
          const cookieEntry: CookieToSet = {
            name: ACTIVE_BUILDING_COOKIE,
            value: switchedTo,
            options: {
              httpOnly: false,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              path: '/',
              maxAge: 60 * 60 * 24 * 365,
            },
          }
          cookiesToSync.push(cookieEntry)
          // Fall through — the request continues with the new cookie.
        } else {
          // No active-subscription building at all: legitimately blocked.
          const url = request.nextUrl.clone()
          url.pathname = '/subscription-inactive'
          return attachCookies(NextResponse.rewrite(url), cookiesToSync)
        }
      }
    }
  }

  // Admin-only building paths — middleware-level 403 with role-aware fallback.
  //
  // If the active-building cookie is missing OR points to a building the user
  // is no longer a member of (stale), we look up the user's first active
  // admin building and SYNC the cookie via:
  //   1. request.cookies.set(...)  → AppLayout & page see the new value in
  //      this same request.
  //   2. cookiesToSync.push(...)   → re-emitted on the final response so the
  //      browser stores it for subsequent requests.
  //
  // Then a SINGLE NextResponse.next({ request }) is built at the end via
  // attachCookies, ensuring all cookie modifications (supabase auth tokens
  // + active_building_id) propagate atomically to Server Components.
  if (startsWithAny(pathname, ADMIN_ONLY_PREFIXES)) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile?.is_super_admin) {
      const activeBuildingId = request.cookies.get(ACTIVE_BUILDING_COOKIE)?.value
      let allowed = false
      let cookieIsValidForUser = false

      if (activeBuildingId) {
        const { data: membership } = await supabase
          .from('building_memberships')
          .select('role')
          .eq('user_id', user.id)
          .eq('building_id', activeBuildingId)
          .eq('is_active', true)
          .maybeSingle()
        if (membership) {
          cookieIsValidForUser = true
          // Respect the user's explicit active-building choice; don't auto-switch.
          allowed = membership.role === 'admin'
        }
      }

      // Cookie missing OR stale → pick first active admin building and sync.
      if (!cookieIsValidForUser) {
        const { data: firstAdmin } = await supabase
          .from('building_memberships')
          .select('building_id')
          .eq('user_id', user.id)
          .eq('role', 'admin')
          .eq('is_active', true)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()

        if (firstAdmin) {
          const adminBuildingId = firstAdmin.building_id
          // 1) Update request cookies — this is what the final
          //    `NextResponse.next({ request })` will propagate to Server Components.
          request.cookies.set(ACTIVE_BUILDING_COOKIE, adminBuildingId)
          // 2) Also queue for the response so the browser stores it.
          const cookieEntry: CookieToSet = {
            name: ACTIVE_BUILDING_COOKIE,
            value: adminBuildingId,
            options: {
              httpOnly: false,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              path: '/',
              maxAge: 60 * 60 * 24 * 365,
            },
          }
          cookiesToSync.push(cookieEntry)
          allowed = true
        }
      }

      if (!allowed) {
        const url = request.nextUrl.clone()
        url.pathname = '/forbidden'
        return attachCookies(
          NextResponse.rewrite(url, { status: 403 }),
          cookiesToSync,
        )
      }
    }
  }

  // Final pass-through. NextResponse.next({ request }) is built ONCE here,
  // after all request.cookies.set calls, so the modified request flows to
  // Server Components. Then attachCookies emits Set-Cookie headers for the
  // browser.
  return attachCookies(NextResponse.next({ request }), cookiesToSync)
}

export const config = {
  matcher: [
    // Run on all paths except static assets, images, manifest, sw.
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
