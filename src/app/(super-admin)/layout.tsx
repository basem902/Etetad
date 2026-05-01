import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { isSuperAdmin, requireUser } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeToggle } from '@/components/theme-toggle'
import { UserMenu } from '@/components/layout/user-menu'
import { SuperAdminNav } from '@/components/super-admin/super-admin-nav'

export default async function SuperAdminLayout({
  children,
}: {
  children: ReactNode
}) {
  // Middleware also gates these routes (rewrite to /forbidden with 403),
  // but we recheck server-side in case a request bypasses middleware.
  const user = await requireUser().catch(() => null)
  if (!user) redirect('/login')

  if (!(await isSuperAdmin(user.id))) {
    redirect('/forbidden')
  }

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle()

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen flex flex-col bg-background">
        <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <div className="flex h-14 items-center justify-between gap-3 px-4 md:px-6">
            <Link
              href="/super-admin"
              className="flex items-center gap-2 font-bold tracking-tight"
            >
              <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
              <span>لوحة المنصة</span>
              <span className="text-xs text-muted-foreground hidden sm:inline">
                Super Admin
              </span>
            </Link>

            <div className="flex items-center gap-2 md:gap-3">
              <ThemeToggle />
              <UserMenu
                fullName={profile?.full_name ?? null}
                email={user.email}
                avatarUrl={user.user_metadata?.avatar_url ?? null}
              />
            </div>
          </div>

          {/* Sub-navigation (client component — icons can't cross RSC boundary) */}
          <SuperAdminNav />
        </header>

        <main className="flex-1 px-4 py-6 md:px-6">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </TooltipProvider>
  )
}
