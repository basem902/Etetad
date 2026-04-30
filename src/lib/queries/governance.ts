import { createClient } from '@/lib/supabase/server'
import type {
  ApprovalRule,
  SuggestionStatus,
  Tables,
  VoteStatus,
} from '@/types/database'
import {
  computeVoteResults,
  type VoteOption,
  type VoteResponseSummary,
  type VoteResults,
} from '@/lib/voting'

// =============================================
// Suggestions
// =============================================

export type SuggestionRow = Tables<'suggestions'> & {
  created_by_name: string | null
  /** linked vote_id when status='converted_to_vote' */
  linked_vote_id: string | null
}

export async function listSuggestions(
  buildingId: string,
  filters: { status?: SuggestionStatus } = {},
): Promise<SuggestionRow[]> {
  const supabase = await createClient()
  let q = supabase
    .from('suggestions')
    .select('*')
    .eq('building_id', buildingId)
    .order('created_at', { ascending: false })

  if (filters.status) q = q.eq('status', filters.status)

  const { data } = await q
  if (!data) return []

  // Enrich with creator name + linked vote (when converted)
  const userIds = Array.from(
    new Set(data.map((s) => s.created_by).filter((x): x is string => Boolean(x))),
  )
  const suggestionIds = data
    .filter((s) => s.status === 'converted_to_vote')
    .map((s) => s.id)

  const [{ data: profiles }, { data: votes }] = await Promise.all([
    userIds.length > 0
      ? supabase.from('profiles').select('id, full_name').in('id', userIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    suggestionIds.length > 0
      ? supabase
          .from('votes')
          .select('id, suggestion_id')
          .in('suggestion_id', suggestionIds)
      : Promise.resolve({ data: [] as { id: string; suggestion_id: string | null }[] }),
  ])

  const profMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name] as const))
  const voteMap = new Map(
    (votes ?? [])
      .filter((v): v is { id: string; suggestion_id: string } => Boolean(v.suggestion_id))
      .map((v) => [v.suggestion_id, v.id] as const),
  )

  return data.map((s) => ({
    ...s,
    created_by_name: s.created_by ? profMap.get(s.created_by) ?? null : null,
    linked_vote_id: voteMap.get(s.id) ?? null,
  }))
}

export async function getSuggestion(
  buildingId: string,
  id: string,
): Promise<SuggestionRow | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('suggestions')
    .select('*')
    .eq('building_id', buildingId)
    .eq('id', id)
    .maybeSingle()
  if (!data) return null

  const [profile, vote] = await Promise.all([
    data.created_by
      ? supabase
          .from('profiles')
          .select('full_name')
          .eq('id', data.created_by)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    data.status === 'converted_to_vote'
      ? supabase
          .from('votes')
          .select('id')
          .eq('suggestion_id', data.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  return {
    ...data,
    created_by_name: profile.data?.full_name ?? null,
    linked_vote_id: vote.data?.id ?? null,
  }
}

// =============================================
// Votes
// =============================================

export type VoteRow = Tables<'votes'> & {
  options_count: number
  /**
   * Number of apartments that have voted so far. NULL when the caller is
   * not allowed to see this stat (resident on an active vote — privacy).
   */
  voted_count: number | null
  created_by_name: string | null
}

/**
 * Backwards-compat alias. After Codex round 3 P1 (Phase 10), `voted_count`
 * is nullable on the base type itself, so this alias is identical to VoteRow.
 */
export type VoteRowWithCount = VoteRow

export async function listVotes(
  buildingId: string,
  filters: { status?: VoteStatus } = {},
): Promise<VoteRowWithCount[]> {
  const supabase = await createClient()
  let q = supabase
    .from('votes')
    .select('*')
    .eq('building_id', buildingId)
    .order('created_at', { ascending: false })

  if (filters.status) q = q.eq('status', filters.status)

  const { data } = await q
  if (!data || data.length === 0) return []

  const ids = data.map((v) => v.id)
  const userIds = Array.from(
    new Set(data.map((v) => v.created_by).filter((x): x is string => Boolean(x))),
  )

  // Codex round 2 P1: voted counts now via SECURITY DEFINER RPC that enforces
  // the privacy rule (residents see counts only after closing).
  const [{ data: opts }, { data: votedCounts }, { data: profs }] = await Promise.all([
    supabase.from('vote_options').select('vote_id').in('vote_id', ids),
    supabase.rpc('get_votes_voted_counts', { p_vote_ids: ids }),
    userIds.length > 0
      ? supabase.from('profiles').select('id, full_name').in('id', userIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ])

  const optsCount = new Map<string, number>()
  for (const o of opts ?? []) {
    optsCount.set(o.vote_id, (optsCount.get(o.vote_id) ?? 0) + 1)
  }

  const votedMap = new Map<string, number | null>()
  for (const row of (votedCounts ?? []) as { vote_id: string; voted: number | null }[]) {
    votedMap.set(row.vote_id, row.voted == null ? null : Number(row.voted))
  }

  const profMap = new Map((profs ?? []).map((p) => [p.id, p.full_name] as const))

  return data.map((v) => ({
    ...v,
    options_count: optsCount.get(v.id) ?? 0,
    voted_count: votedMap.has(v.id) ? votedMap.get(v.id) ?? null : null,
    created_by_name: v.created_by ? profMap.get(v.created_by) ?? null : null,
  }))
}

export async function getVote(
  buildingId: string,
  id: string,
): Promise<VoteRowWithCount | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('votes')
    .select('*')
    .eq('building_id', buildingId)
    .eq('id', id)
    .maybeSingle()
  if (!data) return null

  const [{ data: opts }, { data: votedCount }, profile] = await Promise.all([
    supabase.from('vote_options').select('id').eq('vote_id', id),
    // Codex round 2 P1: privacy-enforcing RPC instead of raw SELECT.
    supabase.rpc('get_vote_voted_count', { p_vote_id: id }),
    data.created_by
      ? supabase
          .from('profiles')
          .select('full_name')
          .eq('id', data.created_by)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  return {
    ...data,
    options_count: opts?.length ?? 0,
    voted_count: votedCount == null ? null : Number(votedCount),
    created_by_name: profile.data?.full_name ?? null,
  }
}

export async function listVoteOptions(voteId: string): Promise<VoteOption[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('vote_options')
    .select('id, label, sort_order')
    .eq('vote_id', voteId)
    .order('sort_order')
  return data ?? []
}

/** Per-apartment summary of who voted for what (admin-only detail). */
export type VoterEntry = {
  apartment_id: string
  apartment_number: string | null
  user_id: string
  user_name: string | null
  option_id: string
  option_label: string
  created_at: string
}

export async function listVoteResponsesDetail(
  voteId: string,
): Promise<VoterEntry[]> {
  const supabase = await createClient()
  const { data: resp } = await supabase
    .from('vote_responses')
    .select('apartment_id, user_id, option_id, created_at')
    .eq('vote_id', voteId)
    .order('created_at', { ascending: false })
  if (!resp || resp.length === 0) return []

  const aptIds = Array.from(new Set(resp.map((r) => r.apartment_id)))
  const userIds = Array.from(new Set(resp.map((r) => r.user_id)))
  const optIds = Array.from(new Set(resp.map((r) => r.option_id)))

  const [{ data: apts }, { data: profs }, { data: opts }] = await Promise.all([
    supabase.from('apartments').select('id, number').in('id', aptIds),
    supabase.from('profiles').select('id, full_name').in('id', userIds),
    supabase.from('vote_options').select('id, label').in('id', optIds),
  ])

  const aptMap = new Map((apts ?? []).map((a) => [a.id, a.number] as const))
  const profMap = new Map((profs ?? []).map((p) => [p.id, p.full_name] as const))
  const optMap = new Map((opts ?? []).map((o) => [o.id, o.label] as const))

  return resp.map((r) => ({
    apartment_id: r.apartment_id,
    apartment_number: aptMap.get(r.apartment_id) ?? null,
    user_id: r.user_id,
    user_name: profMap.get(r.user_id) ?? null,
    option_id: r.option_id,
    option_label: optMap.get(r.option_id) ?? '—',
    created_at: r.created_at,
  }))
}

/**
 * Eligible apartments = apartments in the building with at least one active
 * voting representative. Drives the turnout denominator.
 */
export async function countEligibleApartments(buildingId: string): Promise<number> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('apartment_members')
    .select('apartment_id')
    .eq('building_id', buildingId)
    .eq('is_voting_representative', true)
    .eq('is_active', true)
  if (!data) return 0
  return new Set(data.map((m) => m.apartment_id)).size
}

/**
 * Fully-computed vote results — used on the detail page.
 * Codex round 2 P1: uses SECURITY DEFINER RPC `get_vote_aggregate_counts` so
 * residents can see results AFTER closing without exposing individual votes
 * via raw SELECT. Returns null if the caller is not allowed to see results
 * yet (resident on active vote).
 */
export async function computeVoteResultsFor(
  buildingId: string,
  voteId: string,
  approval_rule: ApprovalRule,
  custom_threshold: number | null,
): Promise<VoteResults | null> {
  const supabase = await createClient()
  const options = await listVoteOptions(voteId)
  const eligible = await countEligibleApartments(buildingId)

  const { data: countsData, error } = await supabase.rpc('get_vote_aggregate_counts', {
    p_vote_id: voteId,
  })
  if (error) {
    // Privacy gate fired ("not yet available") or access denied.
    return null
  }

  // Translate (option_id, vote_count) into VoteResponseSummary[] (one entry per "vote").
  const responses: VoteResponseSummary[] = []
  for (const row of (countsData ?? []) as { option_id: string; vote_count: number }[]) {
    const n = Number(row.vote_count)
    for (let i = 0; i < n; i++) {
      // apartment_id is opaque here — we use an index because the consumer
      // (computeVoteResults) only counts and dedups by option_id when the
      // input is already per-apartment-deduped (which the RPC guarantees).
      responses.push({ apartment_id: `${row.option_id}-${i}`, option_id: row.option_id })
    }
  }

  return computeVoteResults(options, responses, eligible, approval_rule, custom_threshold)
}

/**
 * Per-apartment voting status for the current user. Returns ALL apartments
 * the user is an active voting rep for, with already-voted info (and the
 * prior voter's name + chosen option for transparency to the new rep).
 *
 * Codex round 3 P2: uses SECURITY DEFINER RPC because vote_responses SELECT
 * is restricted to admin-or-self after the privacy hardening. A newly-
 * assigned rep wouldn't otherwise see the previous rep's vote and would be
 * shown a Cast button that fails on UNIQUE.
 */
export type UserVoteApartment = {
  apartment_id: string
  apartment_number: string
  already_voted: boolean
  voted_by_user_name: string | null
  voted_at: string | null
  voted_option_label: string | null
}

export async function listUserVoteApartments(
  voteId: string,
): Promise<UserVoteApartment[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('list_user_vote_apartments', {
    p_vote_id: voteId,
  })
  if (error) return []
  return (data ?? []) as UserVoteApartment[]
}

/**
 * Apartments the current user can ACTUALLY vote for (rep + not yet voted).
 * Backed by the same RPC; just filters to non-voted entries.
 */
export async function listVotableApartmentsForUser(
  voteId: string,
): Promise<{ apartment_id: string; apartment_number: string }[]> {
  const all = await listUserVoteApartments(voteId)
  return all
    .filter((a) => !a.already_voted)
    .map((a) => ({ apartment_id: a.apartment_id, apartment_number: a.apartment_number }))
}

// =============================================
// Decisions
// =============================================

export type DecisionRow = Tables<'decisions'> & {
  created_by_name: string | null
  vote_title: string | null
}

export async function listDecisions(
  buildingId: string,
): Promise<DecisionRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('decisions')
    .select('*')
    .eq('building_id', buildingId)
    .order('decision_date', { ascending: false })
  if (!data) return []

  const userIds = Array.from(
    new Set(data.map((d) => d.created_by).filter((x): x is string => Boolean(x))),
  )
  const voteIds = Array.from(
    new Set(data.map((d) => d.vote_id).filter((x): x is string => Boolean(x))),
  )

  const [{ data: profs }, { data: votes }] = await Promise.all([
    userIds.length > 0
      ? supabase.from('profiles').select('id, full_name').in('id', userIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    voteIds.length > 0
      ? supabase.from('votes').select('id, title').in('id', voteIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ])

  const profMap = new Map((profs ?? []).map((p) => [p.id, p.full_name] as const))
  const voteMap = new Map((votes ?? []).map((v) => [v.id, v.title] as const))

  return data.map((d) => ({
    ...d,
    created_by_name: d.created_by ? profMap.get(d.created_by) ?? null : null,
    vote_title: d.vote_id ? voteMap.get(d.vote_id) ?? null : null,
  }))
}

export async function getDecision(
  buildingId: string,
  id: string,
): Promise<DecisionRow | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('decisions')
    .select('*')
    .eq('building_id', buildingId)
    .eq('id', id)
    .maybeSingle()
  if (!data) return null

  const [profile, vote] = await Promise.all([
    data.created_by
      ? supabase
          .from('profiles')
          .select('full_name')
          .eq('id', data.created_by)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    data.vote_id
      ? supabase
          .from('votes')
          .select('title')
          .eq('id', data.vote_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  return {
    ...data,
    created_by_name: profile.data?.full_name ?? null,
    vote_title: vote.data?.title ?? null,
  }
}
