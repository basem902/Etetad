import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveBuildingId, getUserBuildings } from '@/lib/tenant'
import { hasRole, isSuperAdmin } from '@/lib/permissions'
import { PageHeader } from '@/components/shared/page-header'
import { DocumentsGrid } from '@/components/documents/documents-grid'
import { UploadDialog } from '@/components/documents/upload-dialog'
import {
  listDocuments,
  listDocumentCategories,
} from '@/lib/queries/documents'

export const metadata: Metadata = {
  title: 'المستندات · نظام إدارة العمارة',
}

function single(
  sp: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const v = sp[key]
  return Array.isArray(v) ? v[0] : v
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const buildings = await getUserBuildings(user.id)
  if (buildings.length === 0) redirect('/onboarding')

  const buildingId = (await getActiveBuildingId()) ?? buildings[0]?.building_id
  if (!buildingId) redirect('/onboarding')

  const canManage =
    (await isSuperAdmin(user.id)) ||
    (await hasRole(buildingId, ['admin', 'treasurer', 'committee'], user.id))

  const sp = await searchParams
  const category = single(sp, 'category')
  const q = single(sp, 'q')

  const [documents, categories] = await Promise.all([
    listDocuments(buildingId, {
      category: category ?? undefined,
      q: q ?? undefined,
    }),
    listDocumentCategories(buildingId),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="المستندات"
        description="مركز مستندات العمارة: العقود، الفواتير، محاضر الاجتماعات، إلخ."
        actions={
          canManage ? <UploadDialog categorySuggestions={categories} /> : null
        }
      />

      <DocumentsGrid
        documents={documents}
        categories={categories}
        canManage={canManage}
      />
    </div>
  )
}
