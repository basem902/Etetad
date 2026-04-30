import Link from 'next/link'
import { Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'

/**
 * Header للـ (marketing) routes فقط — مختلف عن AppShell و SuperAdminLayout.
 * بسيط: logo + روابط + CTA "ابدأ" يَذهب لـ /register.
 */
export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 md:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-bold tracking-tight"
        >
          <Building2 className="h-5 w-5 text-primary" aria-hidden />
          <span>إدارة العمارة</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/pricing">الباقات</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/contact">تواصل معنا</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">دخول</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/register">ابدأ مجاناً</Link>
          </Button>
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/pricing">الباقات</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/register">ابدأ</Link>
          </Button>
        </div>

        <div className="hidden md:block">
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
