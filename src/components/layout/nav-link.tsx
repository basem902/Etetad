'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ComponentProps } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavLinkProps extends Omit<ComponentProps<typeof Link>, 'children'> {
  icon?: LucideIcon
  label: string
  exact?: boolean
  pending?: boolean
  variant?: 'sidebar' | 'mobile'
}

export function NavLink({
  href,
  icon: Icon,
  label,
  exact,
  pending,
  variant = 'sidebar',
  className,
  ...props
}: NavLinkProps) {
  const pathname = usePathname()
  const hrefStr = typeof href === 'string' ? href : href.toString()
  const active = exact ? pathname === hrefStr : pathname === hrefStr || pathname.startsWith(`${hrefStr}/`)

  if (variant === 'mobile') {
    return (
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-xs',
          'transition-colors',
          active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
          pending && 'opacity-70',
          className,
        )}
        {...props}
      >
        {Icon && <Icon className="h-5 w-5" aria-hidden />}
        <span>{label}</span>
      </Link>
    )
  }

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 h-9 text-sm font-medium',
        'transition-colors',
        active
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
        pending && 'opacity-70',
        className,
      )}
      {...props}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden />}
      <span className="flex-1 truncate">{label}</span>
      {pending && (
        <span className="text-[10px] text-muted-foreground/70 rounded bg-muted px-1.5 py-0.5">
          قريباً
        </span>
      )}
    </Link>
  )
}
