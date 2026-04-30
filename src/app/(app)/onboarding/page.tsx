import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserBuildings } from '@/lib/tenant'
import { LogoutButton } from '@/components/auth/logout-button'
import { ThemeToggle } from '@/components/theme-toggle'
import { CreateBuildingForm } from '@/components/auth/create-building-form'

export const metadata: Metadata = {
  title: 'مرحباً بك · نظام إدارة العمارة',
}

export default async function OnboardingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const buildings = await getUserBuildings(user.id)
  // If the user already has buildings, send them to dashboard.
  if (buildings.length > 0) redirect('/dashboard')

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 gap-6">
      <header className="absolute top-4 left-4">
        <ThemeToggle />
      </header>

      <div className="w-full max-w-md bg-background border border-border rounded-lg p-6 shadow-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">مرحباً 👋</h1>
          <p className="text-sm text-muted-foreground">
            حسابك جاهز. أنشئ عمارتك الآن لتبدأ.
          </p>
          <p className="text-xs text-muted-foreground" dir="ltr">
            {user.email}
          </p>
        </div>

        <CreateBuildingForm />

        <div className="pt-4 border-t border-border space-y-2 text-center">
          <p className="text-xs text-muted-foreground">
            هل دعاك مدير عمارة بنفس بريدك؟ اطلب منه إعادة الدعوة.
          </p>
          <LogoutButton />
        </div>
      </div>
    </div>
  )
}
