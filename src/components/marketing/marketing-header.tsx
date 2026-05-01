import Link from 'next/link'
import { Building2, Menu, LogIn, Phone, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * Header للـ (marketing) routes فقط — مختلف عن AppShell و SuperAdminLayout.
 * بسيط: logo + روابط + CTA "ابدأ" يَذهب لـ /subscribe (Phase 19+: approval-only).
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
            <Link href="/subscribe?tier=pro&cycle=yearly">ابدأ الآن</Link>
          </Button>
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <Button size="sm" asChild>
            <Link href="/subscribe?tier=pro&cycle=yearly">ابدأ</Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="القائمة">
                <Menu className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild>
                <Link href="/pricing">
                  <Tag className="h-4 w-4" />
                  الباقات
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/contact">
                  <Phone className="h-4 w-4" />
                  تواصل معنا
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/login">
                  <LogIn className="h-4 w-4" />
                  دخول
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="hidden md:block">
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
