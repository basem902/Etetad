import Link from 'next/link'
import { Building } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import type { UserBuilding } from '@/lib/tenant'
import { ThemeToggle } from '@/components/theme-toggle'
import { BuildingSwitcher } from '@/components/layout/building-switcher'
import { UserMenu } from '@/components/layout/user-menu'
import { NotificationsPlaceholder } from '@/components/layout/notifications-placeholder'

interface Props {
  user: User
  buildings: UserBuilding[]
  activeBuildingId: string | null
  fullName: string | null
}

export function AppHeader({ user, buildings, activeBuildingId, fullName }: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="flex h-14 items-center justify-between gap-3 px-3 md:px-6">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 md:hidden"
          aria-label="الرئيسية"
        >
          <Building className="h-5 w-5" />
          <span className="font-bold">العمارة</span>
        </Link>

        <div className="hidden md:flex md:flex-1" />

        <div className="flex items-center gap-2 md:gap-3">
          <BuildingSwitcher buildings={buildings} activeBuildingId={activeBuildingId} />
          <NotificationsPlaceholder />
          <ThemeToggle />
          <UserMenu
            fullName={fullName}
            email={user.email}
            avatarUrl={user.user_metadata?.avatar_url ?? null}
          />
        </div>
      </div>
    </header>
  )
}
