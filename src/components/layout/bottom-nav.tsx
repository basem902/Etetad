'use client'

import { useState } from 'react'
import { Menu } from 'lucide-react'
import type { MembershipRole } from '@/types/database'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { NavLink } from './nav-link'
import { visibleMobileItems, visibleNavItems } from './nav-items'

interface Props {
  role: MembershipRole | null
}

export function BottomNav({ role }: Props) {
  const [open, setOpen] = useState(false)
  const allItems = visibleNavItems(role)
  const mobileItems = visibleMobileItems(role)

  return (
    <nav
      aria-label="القائمة الرئيسية (الجوال)"
      className={cn(
        'md:hidden fixed bottom-0 inset-x-0 z-30',
        'border-t border-border bg-background/95 backdrop-blur',
        'supports-[backdrop-filter]:bg-background/80',
        'pb-[env(safe-area-inset-bottom)]',
      )}
    >
      <div className="flex items-stretch">
        {mobileItems.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            icon={item.icon}
            label={item.label}
            variant="mobile"
            pending={item.pending}
          />
        ))}

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label="فتح القائمة الكاملة"
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-xs',
                'text-muted-foreground hover:text-foreground transition-colors',
              )}
            >
              <Menu className="h-5 w-5" aria-hidden />
              <span>المزيد</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-xl pt-4 max-h-[85vh] overflow-y-auto">
            <SheetHeader className="text-right">
              <SheetTitle>القائمة الكاملة</SheetTitle>
              <SheetDescription>اختر القسم الذي تريد فتحه</SheetDescription>
            </SheetHeader>
            <ul className="mt-4 grid grid-cols-2 gap-2">
              {allItems.map((item) => (
                <li key={item.href}>
                  <NavLink
                    href={item.href}
                    icon={item.icon}
                    label={item.label}
                    pending={item.pending}
                    onClick={() => setOpen(false)}
                  />
                </li>
              ))}
            </ul>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  )
}
