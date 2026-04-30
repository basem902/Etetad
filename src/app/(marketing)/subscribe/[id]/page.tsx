import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertCircle, Clock } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashToken } from '@/lib/tokens'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BankDetailsCard } from '@/components/subscriptions/bank-details-card'
import { ReceiptUploader } from '@/components/subscriptions/receipt-uploader'
import { OrderStatusBadge } from '@/components/subscriptions/order-status-badge'
import type { SubscriptionOrderStatus } from '@/types/database'

export const metadata: Metadata = {
  title: 'تَفاصيل الاشتراك',
  robots: { index: false, follow: false },
}

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

interface BankAccount {
  bank_name: string
  account_holder: string
  iban: string
  account_number: string
}

export default async function SubscribeOrderPage({ params, searchParams }: Props) {
  const { id: orderId } = await params
  const sp = await searchParams
  const rawToken = typeof sp.t === 'string' ? sp.t : ''

  if (!rawToken || rawToken.length < 16) {
    return <ErrorCard message="الرابط غير مكتمل. تَحقَّق من البريد الذي وصلك." />
  }

  // Server-side: fetch order + bank details via the gated RPC
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return <ErrorCard message="الخدمة غير مُكوَّنة. تواصل مع الإدارة." />
  }

  const tokenHash = hashToken(rawToken)
  const { data: rows, error } = await admin.rpc('get_order_for_receipt_page', {
    p_order_id: orderId,
    p_token_hash: tokenHash,
  })

  if (error || !rows || rows.length === 0) {
    return <ErrorCard message="الرابط غير صالح أو منتهي." />
  }

  const order = rows[0]
  if (!order) {
    return <ErrorCard message="الرابط غير صالح." />
  }
  const bankRaw = order.bank_account
  const bank: BankAccount =
    bankRaw && typeof bankRaw === 'object' && !Array.isArray(bankRaw)
      ? {
          bank_name: String((bankRaw as Record<string, unknown>).bank_name ?? ''),
          account_holder: String(
            (bankRaw as Record<string, unknown>).account_holder ?? '',
          ),
          iban: String((bankRaw as Record<string, unknown>).iban ?? ''),
          account_number: String(
            (bankRaw as Record<string, unknown>).account_number ?? '',
          ),
        }
      : { bank_name: '', account_holder: '', iban: '', account_number: '' }

  const status = order.status as SubscriptionOrderStatus

  // Status-based rendering
  if (status === 'awaiting_review' || status === 'provisioning') {
    return (
      <StatusOnlyCard
        message="إيصالك مَستَلم. سَنُراجعه خلال 24 ساعة وسَتَستلم بريد التَفعيل."
        status={status}
      />
    )
  }

  if (status === 'approved') {
    return (
      <StatusOnlyCard
        message="تم اعتماد اشتراكك. افحص بريدك للحصول على رابط الدخول."
        status={status}
      />
    )
  }

  if (status === 'expired') {
    return (
      <ErrorCard message="انتهت صلاحية هذا الطلب (> 30 يوم). أَنشئ طلباً جديداً من صفحة الباقات." />
    )
  }

  // awaiting_payment OR rejected (with retries left): show bank details + uploader
  const canUpload =
    status === 'awaiting_payment' ||
    (status === 'rejected' && order.rejection_attempt_count < 3)

  return (
    <section className="py-12 md:py-16">
      <div className="mx-auto max-w-2xl px-4 md:px-6 space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            طلب اشتراك{' '}
            <span className="font-mono text-base text-muted-foreground">
              {order.reference_number}
            </span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {order.building_name}
          </p>
          <div className="mt-3 flex justify-center">
            <OrderStatusBadge status={status} />
          </div>
        </div>

        {status === 'rejected' && order.rejection_reason && (
          <Card className="border-destructive">
            <CardContent className="pt-6 pb-5">
              <h3 className="font-semibold text-destructive mb-2">
                سبب الرفض السابق
              </h3>
              <p className="text-sm whitespace-pre-wrap">{order.rejection_reason}</p>
              <p className="text-xs text-muted-foreground mt-2">
                {3 - order.rejection_attempt_count > 0
                  ? `لديك ${3 - order.rejection_attempt_count} محاولة متبقية.`
                  : 'تم استنفاد المحاولات.'}
              </p>
            </CardContent>
          </Card>
        )}

        <BankDetailsCard
          referenceNumber={order.reference_number}
          totalAmount={Number(order.total_amount)}
          currency={order.currency}
          bank={bank}
        />

        {canUpload && <ReceiptUploader orderId={orderId} rawToken={rawToken} />}

        <p className="text-center text-xs text-muted-foreground">
          احفظ هذا الرابط من بريدك للرجوع إليه. الرابط صالح 30 يوماً.
        </p>
      </div>
    </section>
  )
}

function ErrorCard({ message }: { message: string }) {
  return (
    <section className="py-16 md:py-20">
      <div className="mx-auto max-w-md px-4 md:px-6">
        <Card>
          <CardContent className="pt-8 pb-10 text-center">
            <div
              aria-hidden
              className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive"
            >
              <AlertCircle className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-semibold mb-2">رابط غير صالح</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed mb-6">
              {message}
            </p>
            <Button asChild variant="outline">
              <Link href="/pricing">عرض الباقات</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}

function StatusOnlyCard({
  message,
  status,
}: {
  message: string
  status: SubscriptionOrderStatus
}) {
  return (
    <section className="py-16 md:py-20">
      <div className="mx-auto max-w-md px-4 md:px-6">
        <Card>
          <CardContent className="pt-8 pb-10 text-center">
            <div
              aria-hidden
              className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary"
            >
              <Clock className="h-7 w-7" />
            </div>
            <div className="mb-3 flex justify-center">
              <OrderStatusBadge status={status} />
            </div>
            <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
              {message}
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
