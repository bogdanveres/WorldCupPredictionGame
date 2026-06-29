import type { Match } from '../types'

// ─── Bracket structure (single source of truth, shared by DataContext + Bracket) ──
export const GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L'] as const

// R32 group-position → bracket slot. Slots use 'NX' format: N=position (1/2/3), X=group.
// e.g. '1A'=1st Group A, '2C'=2nd Group C, '3D'=3rd Group D.
export const R32_SLOTS: Record<string, [string, string]> = {
  m073: ['2A','2B'], m074: ['1E','3D'], m075: ['1F','2C'],
  m076: ['1C','2F'], m077: ['1I','3F'], m078: ['2E','2I'],
  m079: ['1A','3E'], m080: ['1L','3K'], m081: ['1D','3B'],
  m082: ['1G','3I'], m083: ['2K','2L'], m084: ['1H','2J'],
  m085: ['1B','3J'], m086: ['1J','2H'], m087: ['1K','3L'],
  m088: ['2D','2G'],
}

// parent match → its two feeder (child) matches
export const CHILDREN: Record<string, [string, string]> = {
  m089: ['m073','m074'], m090: ['m075','m076'], m091: ['m077','m078'], m092: ['m079','m080'],
  m093: ['m081','m082'], m094: ['m083','m084'], m095: ['m085','m086'], m096: ['m087','m088'],
  m097: ['m089','m090'], m098: ['m091','m092'], m099: ['m093','m094'], m100: ['m095','m096'],
  m101: ['m097','m098'], m102: ['m099','m100'], m104: ['m101','m102'],
}

// Process parents only after their children (R16 → QF → SF → Final).
export const PARENT_ORDER = [
  'm089','m090','m091','m092','m093','m094','m095','m096',
  'm097','m098','m099','m100','m101','m102','m104',
]

export interface SE {
  teamId: string; points: number; goalDifference: number
  goalsFor: number; played: number; group: string
}

export function computeStandings(matches: Match[]): { byGroup: Record<string, SE[]>; completedGroups: Set<string> } {
  const byGroup: Record<string, SE[]> = {}
  const completedGroups = new Set<string>()
  for (const group of GROUPS) {
    const gms = matches.filter(m => m.round === 'GROUP' && m.group === group)
    if (gms.length === 6 && gms.every(m => m.status === 'FINISHED')) completedGroups.add(group)

    const map = new Map<string, SE>()
    gms
      .filter(m => m.homeTeamId !== 'TBD')
      .forEach(m => {
        if (!map.has(m.homeTeamId)) map.set(m.homeTeamId, { teamId: m.homeTeamId, points: 0, goalDifference: 0, goalsFor: 0, played: 0, group })
        if (!map.has(m.awayTeamId)) map.set(m.awayTeamId, { teamId: m.awayTeamId, points: 0, goalDifference: 0, goalsFor: 0, played: 0, group })
      })
    for (const m of gms) {
      if ((m.status !== 'FINISHED' && m.status !== 'LIVE') || m.homeScore === null || m.awayScore === null) continue
      const h = map.get(m.homeTeamId), a = map.get(m.awayTeamId)
      if (!h || !a) continue
      h.played++; a.played++
      h.goalsFor += m.homeScore; h.goalDifference += m.homeScore - m.awayScore
      a.goalsFor += m.awayScore; a.goalDifference += m.awayScore - m.homeScore
      if (m.homeScore > m.awayScore) h.points += 3
      else if (m.awayScore > m.homeScore) a.points += 3
      else { h.points++; a.points++ }
    }
    byGroup[group] = Array.from(map.values()).sort(
      (a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor,
    )
  }
  return { byGroup, completedGroups }
}

// slot format: 'NX' where N=position (1/2/3) and X=group letter.
export function resolveSlot(slot: string, byGroup: Record<string, SE[]>): SE | undefined {
  const pos = parseInt(slot[0]) - 1, g = slot[1]
  const e = byGroup[g]?.[pos]
  return e && e.played > 0 ? e : undefined
}

// A slot is confirmed once its source group has finished all 6 matches.
export function isSlotConfirmed(slot: string, completedGroups: Set<string>): boolean {
  return completedGroups.has(slot[1])  // '1A'→'A', '3D'→'D'
}

// Winner of a FINISHED match. Falls back to score when winnerTeamId is null
// (ESPN sets the winner flag a beat after the FINISHED status).
export function winnerOf(m?: Match): string | null {
  if (!m || m.status !== 'FINISHED') return null
  if (m.winnerTeamId) return m.winnerTeamId
  if (m.homeScore !== null && m.awayScore !== null && m.homeTeamId !== 'TBD' && m.awayTeamId !== 'TBD') {
    if (m.homeScore > m.awayScore) return m.homeTeamId
    if (m.awayScore > m.homeScore) return m.awayTeamId
  }
  return null
}

// Resolve TBD knockout slots to **confirmed** teams only:
//   • R32 slots filled from groups that have finished all 6 matches
//   • R16 → Final slots filled from winners of FINISHED feeder matches
// Projected-but-unconfirmed slots (group still in progress) are left as TBD,
// so we never show a speculative team as if it were locked in.
export function resolveConfirmedKnockout(matches: Match[]): Match[] {
  const { byGroup, completedGroups } = computeStandings(matches)
  const map: Record<string, Match> = Object.fromEntries(matches.map(m => [m.id, m]))

  // 1. R32: fill TBD slots from confirmed group standings
  for (const [mid, slots] of Object.entries(R32_SLOTS)) {
    const match = map[mid]
    if (!match) continue
    let homeTeamId = match.homeTeamId
    let awayTeamId = match.awayTeamId
    if (homeTeamId === 'TBD' && isSlotConfirmed(slots[0], completedGroups)) {
      const e = resolveSlot(slots[0], byGroup); if (e) homeTeamId = e.teamId
    }
    if (awayTeamId === 'TBD' && isSlotConfirmed(slots[1], completedGroups)) {
      const e = resolveSlot(slots[1], byGroup); if (e) awayTeamId = e.teamId
    }
    if (homeTeamId !== match.homeTeamId || awayTeamId !== match.awayTeamId) {
      map[mid] = { ...match, homeTeamId, awayTeamId }
    }
  }

  // 2. Propagate winners up the tree (children already resolved before parents)
  for (const parentId of PARENT_ORDER) {
    const childIds = CHILDREN[parentId]
    const parent = map[parentId]
    if (!childIds || !parent) continue
    const [c1, c2] = childIds.map(id => map[id])
    const h = parent.homeTeamId === 'TBD' ? (winnerOf(c1) ?? 'TBD') : parent.homeTeamId
    const a = parent.awayTeamId === 'TBD' ? (winnerOf(c2) ?? 'TBD') : parent.awayTeamId
    if (h !== parent.homeTeamId || a !== parent.awayTeamId) {
      map[parentId] = { ...parent, homeTeamId: h, awayTeamId: a }
    }
  }

  return matches.map(m => map[m.id] ?? m)
}
