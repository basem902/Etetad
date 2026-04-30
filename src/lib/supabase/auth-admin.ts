import 'server-only'

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Auth-admin wrapper — exposes ONLY Supabase's `auth.admin` API surface.
 *
 * Why this exists (PLAN.md §2.3 amendment):
 * Inviting a user by email or looking up a user by email both require service
 * role (Supabase exposes no public alternative). These are operations on the
 * `auth` schema, NOT on building data. We treat them as an explicit, narrow
 * exception to the "service_role only inside (super-admin)/" rule.
 *
 * The wrapper deliberately returns ONLY `client.auth.admin` so callers cannot
 * accidentally do `from('payments').delete()` to bypass RLS on app tables.
 *
 * Allowed callers: server actions that need to invite or look up auth users.
 * Forbidden uses: anything outside the auth schema.
 */
export function getAuthAdmin() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set — auth-admin wrapper unavailable',
    )
  }

  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  )

  // Return only the auth.admin surface — `from()`, `rpc()`, `storage` are NOT exposed.
  return client.auth.admin
}
