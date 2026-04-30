import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId, getUserBuildings } from '@/lib/tenant'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/shared/page-header'
import { SuggestionForm } from '@/components/suggestions/suggestion-form'

export const metadata: Metadata = {
  title: 'اقتراح جديد · نظام إدارة العمارة',
}

export default async function NewSuggestionPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const buildings = await getUserBuildings(user.id)
  if (buildings.length === 0) redirect('/onboarding')

  const buildingId = (await getActiveBuildingId()) ?? buildings[0]?.building_id
  if (!buildingId) redirect('/onboarding')

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="اقتراح جديد"
        description="أي ساكن يستطيع طرح اقتراح. الإدارة سَتُراجع وتُحوِّل لتصويت إن لزم."
      />
      <Card>
        <CardContent className="pt-6">
          <SuggestionForm />
        </CardContent>
      </Card>
    </div>
  )
}
