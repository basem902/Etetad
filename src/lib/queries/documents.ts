import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/types/database'

export type DocumentRow = Tables<'documents'> & {
  uploaded_by_name: string | null
}

export type DocumentsFilters = {
  category?: string
  /** Free-text search on title (ILIKE %q%). */
  q?: string
}

export async function listDocuments(
  buildingId: string,
  filters: DocumentsFilters = {},
): Promise<DocumentRow[]> {
  const supabase = await createClient()
  let q = supabase
    .from('documents')
    .select('*')
    .eq('building_id', buildingId)
    .order('created_at', { ascending: false })

  if (filters.category && filters.category !== 'all') {
    q = q.eq('category', filters.category)
  }
  if (filters.q && filters.q.trim()) {
    q = q.ilike('title', `%${filters.q.trim()}%`)
  }

  const { data } = await q
  if (!data || data.length === 0) return []

  const userIds = Array.from(
    new Set(data.map((d) => d.uploaded_by).filter((x): x is string => Boolean(x))),
  )
  const { data: profiles } =
    userIds.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', userIds)
      : { data: [] as { id: string; full_name: string | null }[] }
  const profMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name] as const))

  return data.map((d) => ({
    ...d,
    uploaded_by_name: d.uploaded_by ? profMap.get(d.uploaded_by) ?? null : null,
  }))
}

export async function listDocumentCategories(
  buildingId: string,
): Promise<string[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('documents')
    .select('category')
    .eq('building_id', buildingId)
    .not('category', 'is', null)
  if (!data) return []
  const set = new Set<string>()
  for (const r of data) {
    const c = r.category?.trim()
    if (c) set.add(c)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'))
}

export async function getDocument(
  buildingId: string,
  id: string,
): Promise<DocumentRow | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('documents')
    .select('*')
    .eq('building_id', buildingId)
    .eq('id', id)
    .maybeSingle()
  if (!data) return null
  if (!data.uploaded_by) return { ...data, uploaded_by_name: null }
  const { data: prof } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', data.uploaded_by)
    .maybeSingle()
  return { ...data, uploaded_by_name: prof?.full_name ?? null }
}
