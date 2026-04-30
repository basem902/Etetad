import type { Metadata } from 'next'
import Link from 'next/link'
import { CircleSlash } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'الاشتراك غير نشط',
  robots: { index: false, follow: false },
}

// =============================================
// Subscription inactive (Phase 14)
// =============================================
// Shown when a logged-in user attempts to access an authenticated route on a
// building whose subscription_status is 'expired' or 'cancelled'. middleware
// rewrites to this page (HTTP 402-style semantics, but we use 200 + clear
// messaging because the user is authenticated and the issue is billing).
// =============================================
export default function SubscriptionInactivePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 gap-4 text-center">
      <CircleSlash className="h-16 w-16 text-destructive" aria-hidden />
      <h1 className="text-3xl font-bold">الاشتراك غير نشط</h1>
      <p className="text-muted-foreground max-w-md">
        اشتراك هذه العمارة منتهٍ أو ملغى، والوصول معلَّق حتى تجديد الاشتراك.
        تواصل مع مدير المنصة لإعادة التفعيل.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Link href="/onboarding">
          <Button variant="secondary">تبديل العمارة</Button>
        </Link>
      </div>
    </div>
  )
}
