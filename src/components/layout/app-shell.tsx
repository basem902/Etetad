import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import type { UserBuilding } from '@/lib/tenant'
import type { MembershipRole } from '@/types/database'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppSidebar } from './app-sidebar'
import { AppHeader } from './app-header'
import { BottomNav } from './bottom-nav'

interface Props {
  user: User
  buildings: UserBuilding[]
  activeBuildingId: string | null
  activeBuildingName: string | null
  role: MembershipRole | null
  fullName: string | null
  children: ReactNode
}

export function AppShell({
  user,
  buildings,
  activeBuildingId,
  activeBuildingName,
  role,
  fullName,
  children,
}: Props) {
  return (
    <TooltipProvider delayDuration={200}>
      <div
        // Outer flex-row + sidebar on the start, content on the end (RTL: sidebar visually on the right).
        className="min-h-screen flex bg-background text-foreground"
      >
        <AppSidebar role={role} buildingName={activeBuildingName} />

        <div className="flex flex-1 flex-col min-w-0">
          <AppHeader
            user={user}
            buildings={buildings}
            activeBuildingId={activeBuildingId}
            fullName={fullName}
          />

          <main className="flex-1 px-3 py-4 md:px-6 md:py-6 pb-20 md:pb-6">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </main>
        </div>

        <BottomNav role={role} />
      </div>
    </TooltipProvider>
  )
}
