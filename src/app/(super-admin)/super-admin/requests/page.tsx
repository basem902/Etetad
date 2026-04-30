import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { RequestsTable } from '@/components/super-admin/requests-table'
import type { Tables } from '@/types/database'

export const metadata: Metadata = {
  title: 'طلبات الاشتراك · Super Admin',
}

type RequestRow = Tables<'subscription_requests'>

async function getRequests(): Promise<RequestRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('subscription_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error || !data) return []
  return data
}

export default async function RequestsPage() {
  const rows = await getRequests()
  const newCount = rows.filter((r) => r.status === 'new').length

  return (
    <div className="space-y-6">
      <PageHeader
        title="طلبات الاشتراك"
        description={
          newCount > 0
            ? `لديك ${newCount} طلب${newCount === 1 ? '' : 'ات'} جديد لمراجعتها.`
            : 'لا توجد طلبات جديدة. كل الطلبات تَمت معالجتها.'
        }
      />
      <RequestsTable rows={rows} />
    </div>
  )
}
