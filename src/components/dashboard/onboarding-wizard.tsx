'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  CheckCircle2,
  Circle,
  Building2,
  Users,
  Wallet,
  Share2,
  Rocket,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface Step {
  key: string
  icon: typeof Building2
  title: string
  description: string
  href: string
  /** Server-computed completion: passed in from server component */
  done: boolean
}

interface Props {
  apartmentsCount: number
  hasMembers: boolean
  hasJoinLink: boolean
  hasNonAdminMembership: boolean
}

const DISMISS_KEY = 'imarah:onboarding-wizard-dismissed'

/**
 * 5-step onboarding for newly provisioned admins.
 * Phase 18: shown on /dashboard when admin's building has no apartments.
 *
 * Steps complete server-side based on the building's actual state. Admin can
 * also dismiss the wizard via X button — preference stored in localStorage
 * (no DB column needed for v1; future versions can promote to a profile field).
 */
export function OnboardingWizard({
  apartmentsCount,
  hasMembers,
  hasJoinLink,
  hasNonAdminMembership,
}: Props) {
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === 'true')
    }
  }, [])

  const steps: Step[] = [
    {
      key: 'building',
      icon: Building2,
      title: 'تأكيد بيانات العمارة',
      description: 'اضبط الاسم، العنوان، والمدينة من إعدادات العمارة.',
      href: '/super-admin/settings',
      done: true, // building exists if you're here
    },
    {
      key: 'apartments',
      icon: Users,
      title: 'أَضف الشقق',
      description: 'أَنشئ صف لكل شقة في العمارة.',
      href: '/apartments/new',
      done: apartmentsCount > 0,
    },
    {
      key: 'fees',
      icon: Wallet,
      title: 'اضبط الرسوم الشهرية',
      description: 'لكل شقة رسوم خاصة. عدِّلها من صفحة الشقة.',
      href: '/apartments',
      done: apartmentsCount > 0, // approximation: if apartments exist, admin can set fees
    },
    {
      key: 'team',
      icon: Users,
      title: 'أَضف فريقك (اختياري)',
      description: 'أمين صندوق + لجنة + فني عبر "إضافة عضو" في تَفاصيل الشقة.',
      href: '/apartments',
      done: hasNonAdminMembership || hasMembers,
    },
    {
      key: 'invite',
      icon: Share2,
      title: 'شارك رابط الانضمام مع السكان',
      description: 'كل ساكن يَفتحه ويُسجِّل، ثم تُوافق على طلبه.',
      href: '/apartments',
      done: hasJoinLink || hasMembers,
    },
  ]

  const completedCount = steps.filter((s) => s.done).length
  const isComplete = completedCount === steps.length

  // Auto-hide if everything done OR user dismissed
  if (isComplete || dismissed) return null

  function dismiss() {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISS_KEY, 'true')
    }
    setDismissed(true)
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="pt-6 pb-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" aria-hidden />
            <h2 className="font-semibold text-lg">
              أهلاً بك! دعنا نُعدّ عمارتك
            </h2>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={dismiss}
            aria-label="إخفاء المرشد"
            className="h-7 w-7 -mt-1"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          {completedCount} من {steps.length} مُكتملة. أَكمل الخطوات أدناه لتَجهيز
          المنصة لاستخدام السكان.
        </p>

        <ol className="space-y-2">
          {steps.map((step, idx) => {
            const Icon = step.icon
            return (
              <li key={step.key}>
                <Link
                  href={step.href}
                  className={cn(
                    'flex items-start gap-3 rounded-md border border-border bg-card p-3 transition-colors hover:bg-muted/40',
                    step.done && 'opacity-60',
                  )}
                >
                  {step.done ? (
                    <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium text-sm">
                        {idx + 1}. {step.title}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {step.description}
                    </p>
                  </div>
                </Link>
              </li>
            )
          })}
        </ol>

        <p className="text-xs text-muted-foreground mt-4 text-center">
          المرشد يَختفي تلقائياً عند إكمال كل الخطوات، أو اضغط × لإخفائه يدوياً.
        </p>
      </CardContent>
    </Card>
  )
}
