// =============================================
// src/lib/voting.ts — vote results calculation (PURE FUNCTIONS)
// =============================================
// §1.5.2: vote-counting is per-APARTMENT, never per-USER.
// All inputs/outputs reference apartments only — no user-scope leak.
//
// Pure logic, no DB access. Tested in isolation.
// =============================================

import type { ApprovalRule } from '@/types/database'

export type VoteOption = {
  id: string
  label: string
  sort_order: number
}

export type VoteResponseSummary = {
  /** apartment_id of the apartment that voted (NEVER user-id). */
  apartment_id: string
  /** option_id chosen by that apartment. */
  option_id: string
}

export type OptionResult = {
  option_id: string
  label: string
  count: number
  /** percentage of apartments that voted (0..100). */
  percentage: number
}

export type VoteResults = {
  /** Total apartments that cast a vote. */
  total_voted_apartments: number
  /** Total apartments in the building eligible to vote (with active voting rep). */
  total_eligible_apartments: number
  /** Turnout = total_voted / total_eligible (0..1). */
  turnout_ratio: number
  /** Per-option breakdown, ordered by sort_order. */
  options: OptionResult[]
  /** The winning option (highest count). null if tie or no votes. */
  winning_option: OptionResult | null
  /** Whether the winning option meets the approval rule threshold. */
  passes_approval: boolean
  /** Threshold required (e.g. 0.5 for simple_majority, 0.667 for two_thirds). */
  required_threshold: number
}

/** Threshold (as 0..1 ratio) required for a given approval rule. */
export function approvalThreshold(
  rule: ApprovalRule,
  customThreshold: number | null,
): number {
  switch (rule) {
    case 'simple_majority':
      // > 50% — we use 0.5 as the floor; passes_approval check uses strict >
      return 0.5
    case 'two_thirds':
      // ≥ 66.67% (2/3)
      return 2 / 3
    case 'custom':
      if (customThreshold == null || customThreshold <= 0 || customThreshold > 1) {
        // Defensive — caller should have validated. Default to majority.
        return 0.5
      }
      return customThreshold
  }
}

/**
 * Compute vote results from raw responses + options + eligible apartment count.
 *
 * @param options - the vote's options (in sort order)
 * @param responses - one entry per apartment that voted (NOT per user)
 * @param eligibleApartments - count of apartments in the building with an
 *                             active voting representative (denominator for turnout)
 * @param rule - approval rule for the vote
 * @param customThreshold - threshold (0..1) when rule = 'custom'
 */
export function computeVoteResults(
  options: VoteOption[],
  responses: VoteResponseSummary[],
  eligibleApartments: number,
  rule: ApprovalRule,
  customThreshold: number | null,
): VoteResults {
  // Count per option (per-apartment, since responses are deduped by apartment_id at DB).
  const counts = new Map<string, number>()
  for (const r of responses) {
    counts.set(r.option_id, (counts.get(r.option_id) ?? 0) + 1)
  }

  const total_voted = responses.length
  const sorted = [...options].sort((a, b) => a.sort_order - b.sort_order)

  const optionResults: OptionResult[] = sorted.map((o) => {
    const count = counts.get(o.id) ?? 0
    const percentage =
      total_voted === 0 ? 0 : Math.round((count / total_voted) * 1000) / 10
    return {
      option_id: o.id,
      label: o.label,
      count,
      percentage,
    }
  })

  // Winning option = strictly highest count. Ties → no winner.
  let winner: OptionResult | null = null
  if (total_voted > 0) {
    const maxCount = Math.max(...optionResults.map((r) => r.count))
    const topOptions = optionResults.filter((r) => r.count === maxCount)
    if (topOptions.length === 1) {
      winner = topOptions[0] ?? null
    }
    // Otherwise tie — no winner.
  }

  const required = approvalThreshold(rule, customThreshold)

  // Approval check: winner's share of voted apartments must exceed/meet the
  // threshold. simple_majority uses strict >, two_thirds + custom use ≥
  // (matching standard parliamentary conventions).
  let passes = false
  if (winner && total_voted > 0) {
    const winnerRatio = winner.count / total_voted
    if (rule === 'simple_majority') {
      passes = winnerRatio > required
    } else {
      // two_thirds, custom: ≥
      passes = winnerRatio >= required
    }
  }

  const turnout = eligibleApartments === 0 ? 0 : total_voted / eligibleApartments

  return {
    total_voted_apartments: total_voted,
    total_eligible_apartments: eligibleApartments,
    turnout_ratio: Math.round(turnout * 1000) / 1000,
    options: optionResults,
    winning_option: winner,
    passes_approval: passes,
    required_threshold: Math.round(required * 1000) / 1000,
  }
}

/** Format a 0..1 ratio as a percentage string with 1 decimal in Arabic numerals. */
export function formatPercent(ratio: number): string {
  const pct = Math.round(ratio * 1000) / 10
  return `${pct.toFixed(1)}%`
}
