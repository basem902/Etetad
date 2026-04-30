'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun, Monitor } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" aria-hidden tabIndex={-1}>
        <span className="block h-4 w-4" />
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="تبديل المظهر">
          <Sun className="h-4 w-4 dark:hidden" />
          <Moon className="hidden h-4 w-4 dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme('light')} className="justify-between">
          <span className="flex items-center gap-2">
            <Sun className="h-4 w-4" />
            مضيء
          </span>
          {theme === 'light' && <span className="text-xs text-muted-foreground">●</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')} className="justify-between">
          <span className="flex items-center gap-2">
            <Moon className="h-4 w-4" />
            داكن
          </span>
          {theme === 'dark' && <span className="text-xs text-muted-foreground">●</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')} className="justify-between">
          <span className="flex items-center gap-2">
            <Monitor className="h-4 w-4" />
            النظام
          </span>
          {theme === 'system' && <span className="text-xs text-muted-foreground">●</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
