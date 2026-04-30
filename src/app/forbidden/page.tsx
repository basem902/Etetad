import type { Metadata } from 'next'
import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'غير مصرح · 403',
  robots: { index: false, follow: false },
}

export default function ForbiddenPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 gap-4 text-center">
      <ShieldAlert className="h-16 w-16 text-red-600 dark:text-red-400" aria-hidden />
      <h1 className="text-3xl font-bold">403 — غير مصرح</h1>
      <p className="text-muted-foreground max-w-md">
        ليس لديك صلاحية للوصول إلى هذه الصفحة. إن كنت تعتقد أن هذا خطأ، تواصل
        مع مدير المنصة.
      </p>
      <Link href="/dashboard">
        <Button variant="secondary">العودة للوحة التحكم</Button>
      </Link>
    </div>
  )
}
