import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId, getUserBuildings } from '@/lib/tenant'
import { isSuperAdmin, hasRole } from '@/lib/permissions'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AddTeamMemberDialog } from '@/components/team/add-team-member-dialog'
import { DeactivateTeamMemberButton } from '@/components/team/deactivate-team-member-button'
import { ChangeRoleDialog } from '@/components/team/change-role-dialog'
import type { MembershipRole } from '@/types/database'

const ALL_ROLE_LABELS_AR: Record<MembershipRole, string> = {
  admin: 'مدير العمارة',
  treasurer: 'أمين الصندوق',
  committee: 'عضو اللجنة',
  resident: 'ساكن',
  technician: 'فني',
}

export const metadata: Metadata = {
  title: 'فريق العمارة · نظام إدارة العمارة',
}

type TeamRow = {
  membership_id: string
  user_id: string
  role: MembershipRole
  is_active: boolean
  created_at: string
  email: string
  full_name: string | null
}

export default async function TeamPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const buildings = await getUserBuildings(user.id)
  if (buildings.length === 0) redirect('/onboarding')

  const buildingId = (await getActiveBuildingId()) ?? buildings[0]?.building_id
  if (!buildingId) redirect('/onboarding')

  // Admin only (or super_admin platform-wide).
  const allowed =
    (await isSuperAdmin(user.id)) ||
    (await hasRole(buildingId, ['admin'], user.id))
  if (!allowed) redirect('/forbidden')

  // Load team members (non-apartment-bound roles only — admin and resident
  // are managed elsewhere).
  const { data: rows } = await supabase
    .from('building_memberships')
    .select(
      `
      id,
      user_id,
      role,
      is_active,
      created_at
    `,
    )
    .eq('building_id', buildingId)
    .eq('is_active', true)
    // v0.22: show ALL active memberships (admin/treasurer/committee/resident/technician)
    // so the building admin can promote a resident to admin (or demote/reassign).
    // Last-admin protection lives in the change_member_role RPC.
    .order('created_at', { ascending: false })

  // Resolve user info via profiles + auth admin (for emails).
  // Profiles is RLS-restricted by default; admin can read members of own
  // building via existing policies. Email comes from auth.users via the
  // auth.admin client (server-only).
  const userIds = (rows ?? []).map((r) => r.user_id)
  type ProfileRow = { id: string; full_name: string | null }
  const { data: profilesData } = userIds.length
    ? await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds)
    : { data: [] as ProfileRow[] | null }

  // Email lookup via auth admin (paginate; cap modest)
  const emailById = new Map<string, string>()
  if (userIds.length > 0) {
    const { getAuthAdmin } = await import('@/lib/supabase/auth-admin')
    const authAdmin = getAuthAdmin()
    const wanted = new Set(userIds)
    let page = 1
    while (page <= 5 && wanted.size > 0) {
      const res = await authAdmin.listUsers({ page, perPage: 200 })
      const list = res.data?.users ?? []
      for (const u of list) {
        if (wanted.has(u.id) && u.email) {
          emailById.set(u.id, u.email)
          wanted.delete(u.id)
        }
      }
      if (list.length < 200) break
      page++
    }
  }

  const profileById = new Map<string, ProfileRow>(
    (profilesData ?? []).map((p) => [p.id, p as ProfileRow]),
  )

  const teamRows: TeamRow[] = (rows ?? []).map((r) => ({
    membership_id: r.id,
    user_id: r.user_id,
    role: r.role as TeamRow['role'],
    is_active: r.is_active,
    created_at: r.created_at,
    email: emailById.get(r.user_id) ?? '',
    full_name: profileById.get(r.user_id)?.full_name ?? null,
  }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="فريق العمارة"
        description="كل أعضاء العمارة وأدوارهم. يَمكنك تَرقية ساكن إلى مدير، تَعيين أمين صندوق، إلخ."
        actions={<AddTeamMemberDialog />}
      />

      {teamRows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="لا يوجد أعضاء بَعد"
          description="ابدأ بإضافة أعضاء، أو شارك رابط الانضمام مَع السكان من /apartments."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {teamRows.map((m) => (
                <li
                  key={m.membership_id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">
                        {m.full_name ?? m.email ?? 'عضو غير معروف'}
                      </span>
                      <Badge
                        variant={
                          m.role === 'admin'
                            ? 'default'
                            : m.role === 'resident'
                              ? 'outline'
                              : 'secondary'
                        }
                      >
                        {ALL_ROLE_LABELS_AR[m.role]}
                      </Badge>
                    </div>
                    {m.email && (
                      <p
                        className="truncate text-xs text-muted-foreground"
                        dir="ltr"
                      >
                        {m.email}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <ChangeRoleDialog
                      membershipId={m.membership_id}
                      memberName={m.full_name ?? m.email ?? 'عضو'}
                      currentRole={m.role}
                    />
                    {/* deactivate only for non-admin and non-resident roles
                        (admin protected by last-admin rule + super-admin path,
                        resident protected by Phase 19 P2 #3 — apartment workflow) */}
                    {(m.role === 'treasurer' ||
                      m.role === 'committee' ||
                      m.role === 'technician') && (
                      <DeactivateTeamMemberButton
                        membershipId={m.membership_id}
                        memberName={m.full_name ?? m.email ?? 'عضو'}
                        memberEmail={m.email ?? '—'}
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
