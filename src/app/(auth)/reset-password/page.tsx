import type { Metadata } from 'next'
import { ResetPasswordForm } from '@/components/auth/reset-password-form'

export const metadata: Metadata = {
  title: 'تعيين كلمة مرور جديدة · نظام إدارة العمارة',
}

// Note: when the user clicks the email reset link, Supabase opens this page
// with the recovery token in the URL hash. The Supabase client picks up the
// hash automatically and exchanges it for a session, so a logged-in
// `auth.getUser()` session is available by the time the form submits.
export default function ResetPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold">تعيين كلمة مرور جديدة</h1>
        <p className="text-sm text-muted-foreground">
          أدخل كلمة المرور الجديدة وأكّدها
        </p>
      </div>
      <ResetPasswordForm />
    </div>
  )
}
