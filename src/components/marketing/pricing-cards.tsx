'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export interface PricingTier {
  id: string
  name: string
  description: string | null
  price_monthly: number | null
  price_yearly: number | null
  max_apartments: number | null
  max_admins: number | null
  features: string[]
  sort_order: number
}

interface Props {
  tiers: PricingTier[]
}

/**
 * Pricing cards مع toggle شهري/سنوي.
 * المُميَّزة (popular) = pro حالياً. أزرار "اشترك" تَذهب إلى /contact?tier=X
 * في Phase 16 (placeholder)، Phase 18 سيُغيِّرها إلى /subscribe?tier=X.
 */
export function PricingCards({ tiers }: Props) {
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('yearly')

  return (
    <div>
      {/* Toggle */}
      <div className="flex items-center justify-center mb-10">
        <div
          role="tablist"
          aria-label="فترة الاشتراك"
          className="inline-flex items-center rounded-md border border-border bg-card p-1"
        >
          <button
            role="tab"
            aria-selected={cycle === 'monthly'}
            onClick={() => setCycle('monthly')}
            className={cn(
              'px-4 py-1.5 text-sm rounded-sm transition-colors',
              cycle === 'monthly'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            شهري
          </button>
          <button
            role="tab"
            aria-selected={cycle === 'yearly'}
            onClick={() => setCycle('yearly')}
            className={cn(
              'px-4 py-1.5 text-sm rounded-sm transition-colors flex items-center gap-1.5',
              cycle === 'yearly'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            سنوي
            <span className="text-[10px] opacity-90">شهران مجاناً</span>
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {tiers.map((tier) => {
          const isPopular = tier.id === 'pro'
          const price = cycle === 'monthly' ? tier.price_monthly : tier.price_yearly
          const isFree = tier.id === 'trial' || price === null
          const showAsContact = tier.id === 'enterprise'

          return (
            <Card
              key={tier.id}
              className={cn(
                'flex flex-col h-full',
                isPopular && 'border-primary border-2 relative shadow-lg',
              )}
            >
              {isPopular && (
                <Badge className="absolute -top-3 right-1/2 translate-x-1/2 inline-flex items-center gap-1">
                  <Star className="h-3 w-3 fill-current" />
                  الأكثر شيوعاً
                </Badge>
              )}

              <CardHeader>
                <CardTitle className="text-xl">{tier.name}</CardTitle>
                {tier.description && (
                  <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                    {tier.description}
                  </p>
                )}

                <div className="mt-4">
                  {isFree ? (
                    <div className="text-3xl font-bold">مجاناً</div>
                  ) : (
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold tabular-nums">
                        {price?.toLocaleString('ar-SA')}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        SAR / {cycle === 'monthly' ? 'شهر' : 'سنة'}
                      </span>
                    </div>
                  )}
                  {cycle === 'yearly' && tier.price_monthly && tier.price_yearly && (
                    <p className="text-xs text-muted-foreground mt-1">
                      ≈ {(tier.price_yearly / 12).toFixed(0)} SAR/شهر
                    </p>
                  )}
                </div>
              </CardHeader>

              <CardContent className="flex-1 flex flex-col">
                <ul className="space-y-2.5 flex-1 mb-6">
                  {tier.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check
                        className="h-4 w-4 text-success mt-0.5 shrink-0"
                        aria-hidden
                      />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  asChild
                  variant={isPopular ? 'default' : 'outline'}
                  className="w-full"
                >
                  {/*
                    Phase 18: bank-transfer subscription flow.
                    - trial → /register (self-service signup)
                    - enterprise → /contact (custom pricing discussion)
                    - basic/pro → /subscribe?tier=X&cycle=Y (bank-transfer order)
                  */}
                  <Link
                    href={
                      showAsContact
                        ? `/contact?tier=${tier.id}`
                        : tier.id === 'trial'
                          ? '/register'
                          : `/subscribe?tier=${tier.id}&cycle=${cycle}`
                    }
                  >
                    {tier.id === 'trial'
                      ? 'ابدأ التجربة'
                      : showAsContact
                        ? 'تواصل معنا'
                        : 'اشترك الآن'}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground mt-8">
        * الأسعار غير شاملة ضريبة القيمة المضافة (ستُحتسب عند تَفعيل التسجيل الضريبي)
      </p>
    </div>
  )
}
