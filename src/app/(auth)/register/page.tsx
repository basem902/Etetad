import type { Metadata } from 'next'
import { RegisterForm } from '@/components/auth/register-form'

export const metadata: Metadata = {
  title: 'تسجيل عمارة جديدة · نظام إدارة العمارة',
}

export default function RegisterPage() {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold">تسجيل عمارة جديدة</h1>
        <p className="text-sm text-muted-foreground">
          ابدأ بـ تجربة مجانية لمدة 30 يوماً
        </p>
      </div>
      <RegisterForm />
    </div>
  )
}
