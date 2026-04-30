import {
  LayoutDashboard,
  Building2,
  CreditCard,
  Receipt,
  Wrench,
  ClipboardList,
  Users,
  UsersRound,
  Lightbulb,
  Vote,
  Gavel,
  FolderOpen,
  ScrollText,
  BarChart3,
  type LucideIcon,
} from 'lucide-react'
import type { MembershipRole } from '@/types/database'

export type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  /** Roles allowed to see this item. Omit = visible to all building members. */
  roles?: MembershipRole[]
  /** Mark items not yet implemented (pages return 404 today). */
  pending?: boolean
}

export const navItems: NavItem[] = [
  { href: '/dashboard', label: 'لوحة التحكم', icon: LayoutDashboard },
  { href: '/apartments', label: 'الشقق', icon: Building2, roles: ['admin'] },
  { href: '/team', label: 'فريق العمارة', icon: UsersRound, roles: ['admin'] },
  { href: '/payments', label: 'المدفوعات', icon: CreditCard },
  { href: '/expenses', label: 'المصروفات', icon: Receipt },
  { href: '/maintenance', label: 'الصيانة', icon: Wrench },
  { href: '/tasks', label: 'المهام', icon: ClipboardList },
  {
    href: '/vendors',
    label: 'الموردين',
    icon: Users,
    roles: ['admin', 'treasurer', 'committee'],
  },
  { href: '/suggestions', label: 'الاقتراحات', icon: Lightbulb },
  { href: '/votes', label: 'التصويتات', icon: Vote },
  { href: '/decisions', label: 'القرارات', icon: Gavel },
  { href: '/documents', label: 'المستندات', icon: FolderOpen },
  {
    href: '/audit-logs',
    label: 'سجل النشاطات',
    icon: ScrollText,
    roles: ['admin', 'committee'],
  },
  {
    href: '/reports',
    label: 'التقارير',
    icon: BarChart3,
    roles: ['admin', 'treasurer', 'committee'],
  },
]

export function visibleNavItems(role: MembershipRole | null): NavItem[] {
  if (!role) return navItems.filter((i) => !i.roles)
  return navItems.filter((i) => !i.roles || i.roles.includes(role))
}

/** Bottom-nav slimmed down to 4 most-used items (plus a "more" trigger added by the bottom-nav itself).
 *  Each item carries `roles` so the technician (who only manages assigned maintenance)
 *  doesn't see Payments / Votes that they have no permission for. */
export const mobileBottomNav: NavItem[] = [
  { href: '/dashboard', label: 'الرئيسية', icon: LayoutDashboard },
  {
    href: '/payments',
    label: 'الدفعات',
    icon: CreditCard,
    roles: ['admin', 'treasurer', 'committee', 'resident'],
  },
  { href: '/maintenance', label: 'الصيانة', icon: Wrench },
  {
    href: '/votes',
    label: 'التصويتات',
    icon: Vote,
    roles: ['admin', 'treasurer', 'committee', 'resident'],
  },
]

/** Filter mobile-bottom items by the user's role (mirrors visibleNavItems). */
export function visibleMobileItems(role: MembershipRole | null): NavItem[] {
  if (!role) return mobileBottomNav.filter((i) => !i.roles)
  return mobileBottomNav.filter((i) => !i.roles || i.roles.includes(role))
}
