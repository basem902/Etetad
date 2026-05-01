'use client'

/**
 * Client-side wrapper for the super-admin sub-navigation.
 *
 * Why client component? `NavLink` accepts `icon: LucideIcon` (a function/object
 * with methods). React Server Components require all props crossing the
 * RSC→Client boundary to be plain serializable values. Lucide icons are not.
 *
 * Importing the icons inside this `'use client'` module keeps them on the
 * same side of the boundary as `NavLink`. The parent SuperAdminLayout
 * (Server Component) renders <SuperAdminNav /> with no icon props.
 */
import { Building2, FileText, LayoutDashboard, Users } from 'lucide-react'
import { NavLink } from '@/components/layout/nav-link'

export function SuperAdminNav() {
  return (
    <nav
      className="border-t border-border px-4 md:px-6 overflow-x-auto"
      aria-label="تنقّل لوحة المنصة"
    >
      <div className="flex items-center gap-1 py-1 min-w-max">
        <NavLink
          href="/super-admin"
          exact
          icon={LayoutDashboard}
          label="الرئيسية"
        />
        <NavLink
          href="/super-admin/buildings"
          icon={Building2}
          label="العمارات"
        />
        <NavLink
          href="/super-admin/users"
          icon={Users}
          label="المستخدمون"
        />
        <NavLink
          href="/super-admin/audit"
          icon={FileText}
          label="السجلات"
        />
      </div>
    </nav>
  )
}
