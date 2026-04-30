'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { setActiveBuildingId } from '@/lib/tenant'

type ActionResult = { success: true } | { success: false; error: string }

export async function switchBuildingAction(buildingId: string): Promise<ActionResult> {
  if (!buildingId) {
    return { success: false, error: 'معرف العمارة مطلوب' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'غير مصرح' }
  }

  // Verify the user is an active member of the requested building.
  // RLS would also reject queries beyond the user's buildings, but the explicit
  // check here yields a clean error rather than a silent miss.
  const { data, error } = await supabase
    .from('building_memberships')
    .select('building_id')
    .eq('building_id', buildingId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (error || !data) {
    return { success: false, error: 'لست عضواً في هذه العمارة' }
  }

  await setActiveBuildingId(buildingId)
  revalidatePath('/', 'layout')
  return { success: true }
}
