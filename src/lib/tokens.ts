import 'server-only'

import { createHash, randomBytes } from 'node:crypto'

/**
 * Server-only token utilities for Phase 17+ public flows.
 *
 * Pattern (from PLAN v3.27 + lessons #6, #18, #28):
 *   1. Generate `raw token` server-side via cryptographically secure random.
 *   2. Compute SHA-256 hash of the raw token.
 *   3. Store ONLY the hash in DB (`building_join_links.token_hash`).
 *   4. Return raw token to caller ONCE (admin UI shows it once with a warning).
 *   5. Public anon callers pass raw token in URL → server hashes it → looks up.
 *
 * Why SHA-256 (not bcrypt/argon2)?
 *   - These tokens are ≥ 32 bytes of cryptographic randomness — there is no
 *     password to crack. SHA-256 lookup is O(1) with an index; bcrypt would
 *     require iterating every row (no fast lookup).
 *   - Defense is in the entropy of the raw token, not in slow hashing.
 *   - Same pattern Stripe/Slack use for API tokens.
 */

/**
 * Generate a cryptographically secure URL-safe token.
 *
 * Default 32 bytes = 256 bits of entropy = 43 chars in base64url.
 * Sufficient for tokens that should be unguessable even with rate-unlimited
 * brute force.
 */
export function generateRawToken(byteLength = 32): string {
  return randomBytes(byteLength).toString('base64url')
}

/**
 * Compute SHA-256 hash of a raw token, returning lowercase hex (64 chars).
 * Use this both at create-time (store the hash) and at lookup-time (find by
 * the same hash).
 *
 * This function is deterministic — same input always produces same output.
 * No salt is needed because:
 *   - The raw token IS the salt-equivalent (256 bits of randomness).
 *   - We need exact lookup by hash (an indexed equality match).
 */
export function hashToken(rawToken: string): string {
  if (!rawToken || typeof rawToken !== 'string') {
    throw new Error('hashToken: rawToken must be a non-empty string')
  }
  return createHash('sha256').update(rawToken, 'utf8').digest('hex')
}
