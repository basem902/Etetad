import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserBuildings } from '@/lib/tenant'
import { hasRole, isSuperAdmin } from '@/lib/permissions'
import { ThemeToggle } from '@/components/theme-toggle'
import { LogoutButton } from '@/components/auth/logout-button'
import { SetupWizard } from '@/components/onboarding/setup-wizard'

export const metadata: Metadata = {
  title: 'إعداد عمارتك · نظام إدارة العمارة',
}

/**
 * First-login wizard for new building admins.
 *
 * Reached via AppLayout redirect when buildings.setup_completed_at IS NULL
 * AND the caller is admin of that building. Collects 4 fields across
 * separate steps (name, floors, apartments, elevators), then forwards to
 * /onboarding/share/[id] where the admin copies the join link.
 */
export default async function OnboardingSetupPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // super_admin shouldn't ever land here (no building memberships expected)
  if (await isSuperAdmin(user.id)) redirect('/super-admin')

  const buildings = await getUserBuildings(user.id)
  if (buildings.length === 0) redirect('/onboarding')

  // Pick the first building where the caller is admin AND setup not done.
  // We fetch metadata directly because getUserBuildings doesn't expose it.
  const buildingIds = buildings.map((b) => b.building_id)
  const { data: rows } = await supabase
    .from('buildings')
    .select('id, name, city, total_apartments, elevators_count, floors_count, setup_completed_at')
    .in('id', buildingIds)

  type BuildingRow = NonNullable<typeof rows>[number]
  let target: BuildingRow | null = null
  for (const row of rows ?? []) {
    if (row.setup_completed_at != null) continue
    if (await hasRole(row.id, ['admin'], user.id)) {
      target = row
      break
    }
  }

  // No building needs setup → user landed here by mistake, kick them back
  if (!target) redirect('/dashboard')

  return (
    <div className="min-h-screen flex flex-col bg-background" dir="rtl">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h1 className="text-sm font-semibold text-muted-foreground">
          إعداد عمارتك
        </h1>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LogoutButton />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <SetupWizard
          buildingId={target.id}
          initialName={target.name}
          initialApartments={target.total_apartments ?? 0}
          initialElevators={target.elevators_count ?? 0}
          initialFloors={target.floors_count ?? 0}
        />
      </main>
    </div>
  )
}
