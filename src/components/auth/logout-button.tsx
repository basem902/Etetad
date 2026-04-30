'use client'

import { useTransition } from 'react'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { logoutAction } from '@/actions/auth'

export function LogoutButton() {
  const [isPending, startTransition] = useTransition()

  return (
    <Button
      variant="ghost"
      size="sm"
      loading={isPending}
      onClick={() => startTransition(() => logoutAction())}
      aria-label="تسجيل الخروج"
    >
      <LogOut className="h-4 w-4" aria-hidden />
      <span>تسجيل الخروج</span>
    </Button>
  )
}
