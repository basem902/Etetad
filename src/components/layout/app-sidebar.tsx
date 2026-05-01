'use client'

// 'use client' is required because we pass `item.icon` (a Lucide icon
// function/component) to NavLink (Client). Server→Client boundary forbids
// non-serializable props (RSC: "Functions cannot be passed directly to
// Client Components"). Keeping AppSidebar on the client side puts both
// nav-items.ts imports and NavLink on the same side of the boundary.
// Same fix as Phase 14's SuperAdminNav extraction (lesson #48).
import Link from 'next/link'
import { Building } from 'lucide-react'
import type { MembershipRole } from '@/types/database'
import { Separator } from '@/components/ui/separator'
import { NavLink } from './nav-link'
import { visibleNavItems } from './nav-items'

interface Props {
  role: MembershipRole | null
  buildingName?: string | null
}

export function AppSidebar({ role, buildingName }: Props) {
  const items = visibleNavItems(role)

  return (
    <aside
      className="hidden md:flex md:w-64 md:flex-col md:border-l md:border-border md:bg-card/30"
      aria-label="القائمة الجانبية"
    >
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <Building className="h-5 w-5 text-muted-foreground" aria-hidden />
        <Link href="/dashboard" className="font-bold text-base truncate">
          {buildingName ?? 'نظام إدارة العمارة'}
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-0.5">
          {items.map((item) => (
            <li key={item.href}>
              <NavLink
                href={item.href}
                icon={item.icon}
                label={item.label}
                pending={item.pending}
              />
            </li>
          ))}
        </ul>
      </nav>

      <Separator />

      <div className="p-3 text-xs text-muted-foreground">نظام إدارة العمارة · v0.1</div>
    </aside>
  )
}
