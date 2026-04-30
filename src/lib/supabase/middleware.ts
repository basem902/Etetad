import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { type NextRequest } from 'next/server'
import type { Database } from '@/types/database'

export type CookieToSet = {
  name: string
  value: string
  options: CookieOptions
}

/**
 * Middleware helper: refreshes the Supabase auth session and returns the
 * supabase client, the resolved user, and a `cookiesToSync` list — every
 * cookie write (e.g., refreshed auth tokens) Supabase asked for.
 *
 * The caller is responsible for composing the final NextResponse and applying
 * `cookiesToSync` to it (via the helper exported below). This pattern lets
 * the caller add its own request.cookies modifications and have them all
 * propagate together to downstream Server Components in the same request,
 * via a single `NextResponse.next({ request })` (or redirect/rewrite) at the
 * end. Mid-request response recreation is avoided so we can't accidentally
 * drop supabase's auth cookies.
 */
export async function updateSession(request: NextRequest) {
  const cookiesToSync: CookieToSet[] = []

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          // Mutate the request so any subsequent cookie reads inside this
          // middleware (and the Server Components downstream when the final
          // NextResponse.next({ request }) is built) see the latest values.
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value)
          })
          // Collect for the caller to re-emit on the final response.
          cookiesToSync.push(...cookiesToSet)
        },
      },
    },
  )

  // IMPORTANT: getUser() validates the JWT against Supabase. Always use this
  // in middleware (not getSession() which only reads from cookies).
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return { supabase, user, cookiesToSync }
}

/** Apply collected cookies to any NextResponse (next/redirect/rewrite). */
export function attachCookies<T extends { cookies: { set: (n: string, v: string, o?: CookieOptions) => unknown } }>(
  res: T,
  cookies: CookieToSet[],
): T {
  for (const { name, value, options } of cookies) {
    res.cookies.set(name, value, options)
  }
  return res
}
