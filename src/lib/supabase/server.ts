import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'

type CookieToSet = { name: string; value: string; options: CookieOptions }

/**
 * Server-side Supabase client (anon key + user JWT from cookies).
 * Use in Server Components, Server Actions, and Route Handlers.
 * Subject to RLS — auth.uid() is set from the JWT.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // setAll fails inside Server Components (cookies are read-only there).
            // Middleware handles the actual cookie refresh, so this is safe to ignore.
          }
        },
      },
    },
  )
}
