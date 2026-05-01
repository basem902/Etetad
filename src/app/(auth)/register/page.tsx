import { redirect } from 'next/navigation'

/**
 * /register is retired (Phase 19+ ops decision: approval-based onboarding only).
 *
 * The original self-service flow created an account + a building immediately,
 * with no super_admin review. The chosen architecture for this deployment is:
 * every new building goes through /subscribe (Phase 18 bank-transfer order +
 * super_admin approval).
 *
 * We keep the route alive to avoid 404s for any external links / cached email
 * deep-links / bookmarks. It transparently redirects to the subscription
 * funnel (default tier=pro yearly — pricing-cards links pass real tier/cycle).
 *
 * If you want to restore self-service signup later: revert this file to the
 * original `<RegisterForm />` content. The component + action + zod schema
 * are still in the tree (intentionally kept for fast restoration).
 */
export default function RegisterRedirectPage() {
  redirect('/subscribe?tier=pro&cycle=yearly')
}
