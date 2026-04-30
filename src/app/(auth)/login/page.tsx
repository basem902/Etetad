import type { Metadata } from 'next'
import { LoginForm } from '@/components/auth/login-form'

export const metadata: Metadata = {
  title: 'تسجيل الدخول · نظام إدارة العمارة',
}

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold">تسجيل الدخول</h1>
        <p className="text-sm text-muted-foreground">أهلاً بعودتك</p>
      </div>
      <LoginForm />
    </div>
  )
}
