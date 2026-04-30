import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId, getUserBuildings } from '@/lib/tenant'
import { isSuperAdmin, hasRole } from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/shared/page-header'
import { BulkImportForm } from '@/components/bulk-import/bulk-import-form'

export const metadata: Metadata = {
  title: 'استيراد سكان من ملف · نظام إدارة العمارة',
}

export default async function ImportMembersPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const buildings = await getUserBuildings(user.id)
  if (buildings.length === 0) redirect('/onboarding')

  const buildingId = (await getActiveBuildingId()) ?? buildings[0]?.building_id
  if (!buildingId) redirect('/onboarding')

  const allowed =
    (await isSuperAdmin(user.id)) ||
    (await hasRole(buildingId, ['admin'], user.id))
  if (!allowed) redirect('/forbidden')

  return (
    <div className="space-y-6">
      <PageHeader
        title="استيراد سكان دفعة واحدة"
        description="ارفع ملف يَحوي بيانات السكان. يَجب أن تَكون الشقق + المستخدمون مَوجودين مُسبَقاً."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/apartments">
              <ArrowRight className="h-4 w-4" />
              رجوع
            </Link>
          </Button>
        }
      />

      <BulkImportForm
        type="members"
        sampleHeader="email,apartment_number,relation_type"
        description="email يَجب أن يَكون لمستخدم مُسجَّل. apartment_number يَجب أن يَكون مَوجوداً في هذه العمارة. relation_type من: owner / resident / representative."
        redirectAfter="/apartments"
      />
    </div>
  )
}
