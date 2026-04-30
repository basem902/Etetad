import type { Metadata } from 'next'
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form'

export const metadata: Metadata = {
  title: 'استعادة كلمة المرور · نظام إدارة العمارة',
}

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold">استعادة كلمة المرور</h1>
        <p className="text-sm text-muted-foreground">
          أدخل بريدك الإلكتروني لاستلام رابط إعادة التعيين
        </p>
      </div>
      <ForgotPasswordForm />
    </div>
  )
}
