import type { Metadata } from 'next'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hasRole, isSuperAdmin } from '@/lib/permissions'
import { generateRawToken, hashToken } from '@/lib/tokens'
import { ThemeToggle } from '@/components/theme-toggle'
import { LogoutButton } from '@/components/auth/logout-button'
import { ShareLinkCard } from '@/components/onboarding/share-link-card'

export const metadata: Metadata = {
  title: 'شارِك رابط الدَعوة · نظام إدارة العمارة',
}

interface Props {
  params: Promise<{ buildingId: string }>
}

/**
 * Post-wizard share page.
 *
 * Generates a fresh join-link on each visit (rotates any existing link).
 * The admin's normal flow is: wizard → here → copy/share → /dashboard. If
 * they refresh, they get a new link; old ones invalidate. The /apartments
 * page has a separate ShareJoinLink dialog for later rotations.
 */
export default async function OnboardingSharePage({ params }: Props) {
  const { buildingId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (await isSuperAdmin(user.id)) redirect('/super-admin')

  const allowed = await hasRole(buildingId, ['admin'], user.id)
  if (!allowed) notFound()

  const { data: building } = await supabase
    .from('buildings')
    .select('name, total_apartments')
    .eq('id', buildingId)
    .maybeSingle()

  if (!building) notFound()

  // Generate a fresh link. The DB RPC rotates (atomic UPDATE-then-INSERT)
  // so any prior link for this building is invalidated.
  const rawToken = generateRawToken()
  const tokenHash = hashToken(rawToken)
  const expiresAt = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000,
  ).toISOString()

  const { error: linkErr } = await supabase.rpc('create_building_join_link', {
    p_building_id: buildingId,
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
    p_max_uses: null,
  })

  if (linkErr) {
    return (
      <div className="min-h-screen flex flex-col bg-background" dir="rtl">
        <header className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h1 className="text-sm font-semibold text-muted-foreground">
            شارِك رابط الدَعوة
          </h1>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LogoutButton />
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-md text-center space-y-3">
            <p className="text-destructive">
              تَعذَّر إنشاء رابط الدَعوة. حاوِل مَرَّة أُخرى مِن صَفحة الشُقَق.
            </p>
            <a
              href="/dashboard"
              className="inline-block text-sm text-primary hover:underline"
            >
              المُتابَعة لِلَوحة التَحكُّم
            </a>
          </div>
        </main>
      </div>
    )
  }

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  ).replace(/\/$/, '')
  const shareUrl = `${appUrl}/join/${rawToken}`

  return (
    <div className="min-h-screen flex flex-col bg-background" dir="rtl">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h1 className="text-sm font-semibold text-muted-foreground">
          شارِك رابط الدَعوة
        </h1>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LogoutButton />
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center p-4">
        <ShareLinkCard
          buildingName={building.name}
          totalApartments={building.total_apartments ?? 0}
          shareUrl={shareUrl}
        />
      </main>
    </div>
  )
}
