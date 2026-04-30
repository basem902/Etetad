import type { ReactNode } from 'react'
import Link from 'next/link'
import { ThemeToggle } from '@/components/theme-toggle'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 gap-6 bg-background">
      <header className="absolute top-4 left-4">
        <ThemeToggle />
      </header>

      <Link href="/" className="text-xl font-bold tracking-tight">
        نظام إدارة العمارة
      </Link>

      <main className="w-full max-w-md bg-background border border-border rounded-lg p-6 shadow-sm">
        {children}
      </main>

      <p className="text-xs text-muted-foreground">
        منصة شفافة لإدارة العمارات السكنية
      </p>
    </div>
  )
}
