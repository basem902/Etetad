import { createClient } from '@/lib/supabase/server'
import type {
  ApartmentStatus,
  ApartmentRelation,
} from '@/types/database'

export type ApartmentRow = {
  id: string
  number: string
  floor: number | null
  monthly_fee: number
  status: ApartmentStatus
  notes: string | null
  created_at: string
  updated_at: string
  member_count: number
  voting_rep: { member_id: string; full_name: string | null } | null
}

export type ApartmentsFilters = {
  status?: ApartmentStatus
  floor?: number
  /** "with" = has at least one active member; "without" = none. */
  occupancy?: 'with' | 'without'
}

export async function listApartments(
  buildingId: string,
  filters: ApartmentsFilters = {},
): Promise<ApartmentRow[]> {
  const supabase = await createClient()

  let q = supabase
    .from('apartments')
    .select('id, number, floor, monthly_fee, status, notes, created_at, updated_at')
    .eq('building_id', buildingId)
    .order('floor', { ascending: true, nullsFirst: false })
    .order('number', { ascending: true })

  if (filters.status) q = q.eq('status', filters.status)
  if (typeof filters.floor === 'number') q = q.eq('floor', filters.floor)

  const { data: apts, error } = await q
  if (error || !apts) return []

  if (apts.length === 0) return []

  const aptIds = apts.map((a) => a.id)
  const { data: members } = await supabase
    .from('apartment_members')
    .select('id, apartment_id, user_id, is_voting_representative')
    .in('apartment_id', aptIds)
    .eq('is_active', true)

  const memberRows = members ?? []
  const userIds = Array.from(new Set(memberRows.map((m) => m.user_id)))
  const profileMap = new Map<string, string | null>()
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds)
    for (const p of profiles ?? []) profileMap.set(p.id, p.full_name)
  }

  const enriched: ApartmentRow[] = apts.map((apt) => {
    const aptMembers = memberRows.filter((m) => m.apartment_id === apt.id)
    const rep = aptMembers.find((m) => m.is_voting_representative)
    return {
      id: apt.id,
      number: apt.number,
      floor: apt.floor,
      monthly_fee: Number(apt.monthly_fee),
      status: apt.status,
      notes: apt.notes,
      created_at: apt.created_at,
      updated_at: apt.updated_at,
      member_count: aptMembers.length,
      voting_rep: rep
        ? { member_id: rep.id, full_name: profileMap.get(rep.user_id) ?? null }
        : null,
    }
  })

  if (filters.occupancy === 'with') return enriched.filter((a) => a.member_count > 0)
  if (filters.occupancy === 'without') return enriched.filter((a) => a.member_count === 0)
  return enriched
}

export async function getApartment(
  buildingId: string,
  apartmentId: string,
): Promise<ApartmentRow | null> {
  const supabase = await createClient()
  const { data: apt } = await supabase
    .from('apartments')
    .select('id, number, floor, monthly_fee, status, notes, created_at, updated_at')
    .eq('building_id', buildingId)
    .eq('id', apartmentId)
    .maybeSingle()

  if (!apt) return null

  const { data: members } = await supabase
    .from('apartment_members')
    .select('id, user_id, is_voting_representative')
    .eq('apartment_id', apartmentId)
    .eq('is_active', true)

  const memberRows = members ?? []
  const rep = memberRows.find((m) => m.is_voting_representative)
  let repName: string | null = null
  if (rep) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', rep.user_id)
      .maybeSingle()
    repName = prof?.full_name ?? null
  }

  return {
    id: apt.id,
    number: apt.number,
    floor: apt.floor,
    monthly_fee: Number(apt.monthly_fee),
    status: apt.status,
    notes: apt.notes,
    created_at: apt.created_at,
    updated_at: apt.updated_at,
    member_count: memberRows.length,
    voting_rep: rep ? { member_id: rep.id, full_name: repName } : null,
  }
}

export type ApartmentMemberRow = {
  id: string
  user_id: string
  full_name: string | null
  phone: string | null
  relation_type: ApartmentRelation
  is_voting_representative: boolean
  created_at: string
}

export async function getApartmentMembers(
  apartmentId: string,
): Promise<ApartmentMemberRow[]> {
  const supabase = await createClient()
  const { data: members } = await supabase
    .from('apartment_members')
    .select('id, user_id, relation_type, is_voting_representative, created_at')
    .eq('apartment_id', apartmentId)
    .eq('is_active', true)
    .order('is_voting_representative', { ascending: false })
    .order('created_at', { ascending: true })

  const rows = members ?? []
  if (rows.length === 0) return []

  const userIds = Array.from(new Set(rows.map((r) => r.user_id)))
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, phone')
    .in('id', userIds)
  const pmap = new Map((profiles ?? []).map((p) => [p.id, p] as const))

  return rows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    full_name: pmap.get(r.user_id)?.full_name ?? null,
    phone: pmap.get(r.user_id)?.phone ?? null,
    relation_type: r.relation_type,
    is_voting_representative: r.is_voting_representative,
    created_at: r.created_at,
  }))
}
