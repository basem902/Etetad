import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/shared/page-header'
import { OrderReviewCard } from '@/components/super-admin/order-review-card'
import type { Tables } from '@/types/database'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  return {
    title: `طلب اشتراك ${id.slice(0, 8)} · Super Admin`,
  }
}

export default async function SuperAdminOrderDetailPage({ params }: Props) {
  const { id: orderId } = await params

  const supabase = await createClient()
  const { data: order } = await supabase
    .from('subscription_orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle()

  if (!order) notFound()

  // Generate signed URL for receipt preview (15 min TTL).
  // Storage RLS is deny-all on anon — only service_role can sign.
  let receiptSignedUrl: string | null = null
  if (order.receipt_url) {
    try {
      const admin = createAdminClient()
      const { data: signed } = await admin.storage
        .from('subscription_receipts')
        .createSignedUrl(order.receipt_url, 60 * 15)
      receiptSignedUrl = signed?.signedUrl ?? null
    } catch {
      // service_role missing in dev — receipt preview unavailable but page renders
      receiptSignedUrl = null
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`طلب ${order.reference_number}`}
        description={`${order.full_name} · ${order.building_name}`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/super-admin/orders">
              <ArrowRight className="h-4 w-4" />
              العودة للطلبات
            </Link>
          </Button>
        }
      />

      <OrderReviewCard
        order={order as Tables<'subscription_orders'>}
        receiptSignedUrl={receiptSignedUrl}
      />
    </div>
  )
}
