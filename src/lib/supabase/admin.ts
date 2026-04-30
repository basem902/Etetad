import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Service-role Supabase client — BYPASSES RLS.
 *
 * **STRICT USAGE RULES** (per PLAN.md §2.3, extended in v3.32):
 * - Server-only (the `import 'server-only'` above enforces this at build time)
 * - NEVER import from a client component
 * - NEVER use for READs (super_admin reads use normal client + RLS clauses)
 * - WRITEs must go through SECURITY DEFINER RPCs that enforce constraints
 *   internally — admin client must NOT touch tables directly
 *
 * Sanctioned call sites (narrow scope):
 *
 * 1. `src/app/(super-admin)/...` server routes/actions
 *    Platform-level WRITEs (subscription_plan/status, building disable,
 *    extend trial, transfer ownership, promote to super_admin). RPCs:
 *    `update_building_subscription`, `building_usage_detail`, etc.
 *
 * 2. `src/actions/marketing.ts` (Phase 16, v3.32 amendment)
 *    Public form choke points (no anon table writes — RLS closed). RPCs:
 *    `submit_contact_request` (the /contact form's only INSERT path),
 *    `log_email_failure` (audit trail for graceful email degradation).
 *    The action layer adds HTTP-level rate limit + Zod validation; the
 *    RPCs enforce DB-level constraints (length, honeypot, status forced).
 *
 * Adding a new call site requires updating PLAN.md §2.3 + a Codex review
 * round, NOT a casual code change.
 */
export function createAdminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set — admin client unavailable',
    )
  }

  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  )
}
