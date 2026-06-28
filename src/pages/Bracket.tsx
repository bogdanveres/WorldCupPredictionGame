import { useMemo, useState } from 'react'
import { useData } from '../contexts/DataContext'
import type { Match, MatchRound } from '../types'

// ─── Layout ────────────────────────────────────────────────────────────────
const SLOT_H   = 76    // px per R32 slot
const CARD_H   = 68    // px, compact tree card
const COL_W    = 190   // px per round column
const COL_GAP  = 30    // px gap between columns (connector lines live here)
const COL_STEP = COL_W + COL_GAP
const TOTAL_H  = 16 * SLOT_H            // 1216px
const TOTAL_W  = 5 * COL_STEP - COL_GAP // 1118px

const GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L'] as const

// ─── Bracket structure ─────────────────────────────────────────────────────
const R32_ORDER = [
  'm073','m074','m075','m076','m077','m078','m079','m080',
  'm081','m082','m083','m084','m085','m086','m087','m088',
]

type BPos = { topSlot: number; spanSlots: number; colIndex: number }

const BP: Record<string, BPos> = {
  ...Object.fromEntries(R32_ORDER.map((id, i) => [id, { topSlot: i, spanSlots: 1, colIndex: 0 }])),
  m089: { topSlot: 0,  spanSlots: 2, colIndex: 1 }, m090: { topSlot: 2,  spanSlots: 2, colIndex: 1 },
  m091: { topSlot: 4,  spanSlots: 2, colIndex: 1 }, m092: { topSlot: 6,  spanSlots: 2, colIndex: 1 },
  m093: { topSlot: 8,  spanSlots: 2, colIndex: 1 }, m094: { topSlot: 10, spanSlots: 2, colIndex: 1 },
  m095: { topSlot: 12, spanSlots: 2, colIndex: 1 }, m096: { topSlot: 14, spanSlots: 2, colIndex: 1 },
  m097: { topSlot: 0,  spanSlots: 4, colIndex: 2 }, m098: { topSlot: 4,  spanSlots: 4, colIndex: 2 },
  m099: { topSlot: 8,  spanSlots: 4, colIndex: 2 }, m100: { topSlot: 12, spanSlots: 4, colIndex: 2 },
  m101: { topSlot: 0,  spanSlots: 8, colIndex: 3 },
  m102: { topSlot: 8,  spanSlots: 8, colIndex: 3 },
  m104: { topSlot: 0,  spanSlots: 16, colIndex: 4 },
}

const CHILDREN: Record<string, [string, string]> = {
  m089: ['m073','m074'], m090: ['m075','m076'], m091: ['m077','m078'], m092: ['m079','m080'],
  m093: ['m081','m082'], m094: ['m083','m084'], m095: ['m085','m086'], m096: ['m087','m088'],
  m097: ['m089','m090'], m098: ['m091','m092'], m099: ['m093','m094'], m100: ['m095','m096'],
  m101: ['m097','m098'], m102: ['m099','m100'], m104: ['m101','m102'],
}

// R32 group-position → bracket slot (adjacent-group pairing approximation)
// Slots use 'NX' format: N=position (1/2/3), X=group letter.
// e.g. '1A'=1st Group A, '2C'=2nd Group C, '3D'=3rd Group D.
// R32 pairings match the official WC2026 bracket (derived from ESPN schedule).
const R32_SLOTS: Record<string, [string, string]> = {
  m073: ['2A','2B'], m074: ['1E','3D'], m075: ['1F','2C'],
  m076: ['1C','2F'], m077: ['1I','3F'], m078: ['2E','2I'],
  m079: ['1A','3E'], m080: ['1L','3K'], m081: ['1D','3B'],
  m082: ['1G','3I'], m083: ['2K','2L'], m084: ['1H','2J'],
  m085: ['1B','3J'], m086: ['1J','2H'], m087: ['1K','3L'],
  m088: ['2D','2G'],
}

const COL_LABELS = ['Round of 32','Round of 16','Quarter-finals','Semi-finals','Final']

// ─── Round config (for tab view) ───────────────────────────────────────────
const ROUND_CONFIG: { round: MatchRound; label: string; short: string }[] = [
  { round: 'ROUND_OF_32',   label: 'Round of 32',   short: 'R32'   },
  { round: 'ROUND_OF_16',   label: 'Round of 16',   short: 'R16'   },
  { round: 'QUARTER_FINAL', label: 'Quarter-finals', short: 'QF'    },
  { round: 'SEMI_FINAL',    label: 'Semi-finals',    short: 'SF'    },
  { round: 'THIRD_PLACE',   label: '3rd Place',      short: '3rd'   },
  { round: 'FINAL',         label: 'Final',          short: 'Final' },
]

// ─── Standings (project R32 slots from group stage) ─────────────────────────
interface SE {
  teamId: string; points: number; goalDifference: number
  goalsFor: number; played: number; group: string
}

function computeStandings(matches: Match[]): { byGroup: Record<string, SE[]>; completedGroups: Set<string> } {
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
function resolveSlot(slot: string, byGroup: Record<string, SE[]>): SE | undefined {
  const pos = parseInt(slot[0]) - 1, g = slot[1]
  const e = byGroup[g]?.[pos]; return e?.played > 0 ? e : undefined
}

// A slot is confirmed once its source group has finished all 6 matches.
function isSlotConfirmed(slot: string, completedGroups: Set<string>): boolean {
  return completedGroups.has(slot[1])  // '1A'→'A', '3D'→'D'
}

// ─── Shared types ──────────────────────────────────────────────────────────
type TMap = Record<string, { flagEmoji: string; shortName: string }>
type Proj = { homeSlot: string; awaySlot: string; home?: SE; away?: SE; homeConfirmed: boolean; awayConfirmed: boolean }
type ProjMap = Record<string, Proj>

// ─── Page ──────────────────────────────────────────────────────────────────
export default function Bracket() {
  const { matches, teamMap } = useData()
  const [view, setView] = useState<'tree' | 'rounds'>('tree')
  const [selectedRound, setSelectedRound] = useState<MatchRound | null>(null)

  const matchMap = useMemo(() => Object.fromEntries(matches.map(m => [m.id, m])), [matches])
  const standings = useMemo(() => computeStandings(matches), [matches])

  const projected = useMemo<ProjMap>(() => {
    const map: ProjMap = {}
    for (const [mid, slots] of Object.entries(R32_SLOTS)) {
      const match = matchMap[mid]
      if (!match || (match.homeTeamId !== 'TBD' && match.awayTeamId !== 'TBD')) continue
      const homeConfirmed = isSlotConfirmed(slots[0], standings.completedGroups)
      const awayConfirmed = isSlotConfirmed(slots[1], standings.completedGroups)
      map[mid] = {
        homeSlot: slots[0], awaySlot: slots[1],
        home: match.homeTeamId === 'TBD' ? resolveSlot(slots[0], standings.byGroup) : undefined,
        away: match.awayTeamId === 'TBD' ? resolveSlot(slots[1], standings.byGroup) : undefined,
        homeConfirmed,
        awayConfirmed,
      }
    }
    return map
  }, [matchMap, standings])

  // Only count unconfirmed projections for the amber warning
  const anyProj = Object.values(projected).some(p =>
    (p.home && !p.homeConfirmed) || (p.away && !p.awayConfirmed)
  )

  return (
    <div className="py-6 px-4">
      <div className="flex items-center justify-between mb-4 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-white">Knockout Stage</h1>
        <div className="flex rounded-lg overflow-hidden border border-slate-700 text-sm">
          <button
            onClick={() => setView('tree')}
            className={`px-3 py-1.5 font-medium transition-colors ${view === 'tree' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
          >
            Bracket
          </button>
          <button
            onClick={() => setView('rounds')}
            className={`px-3 py-1.5 font-medium transition-colors ${view === 'rounds' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
          >
            Rounds
          </button>
        </div>
      </div>

      {anyProj && (
        <p className="text-xs text-amber-500/70 mb-3 max-w-5xl mx-auto">
          ⚠ Teams in amber are projected from current standings — not yet confirmed
        </p>
      )}

      {view === 'tree'
        ? <BracketTree matchMap={matchMap} teamMap={teamMap} projected={projected} />
        : <RoundsView
            matches={matches} teamMap={teamMap} projected={projected}
            selectedRound={selectedRound} onSelectRound={setSelectedRound}
          />
      }
    </div>
  )
}

// ─── Bracket tree ──────────────────────────────────────────────────────────
function BracketTree({ matchMap, teamMap, projected }: {
  matchMap: Record<string, Match>; teamMap: TMap; projected: ProjMap
}) {
  const connectors = useMemo(() =>
    Object.entries(CHILDREN).flatMap(([parentId, [c1Id, c2Id]]) => {
      const p = BP[parentId], c1 = BP[c1Id], c2 = BP[c2Id]
      if (!p || !c1 || !c2) return []
      const cx  = c1.colIndex * COL_STEP
      const mid = cx + COL_W + COL_GAP * 0.45
      const c1Y = (c1.topSlot + c1.spanSlots / 2) * SLOT_H
      const c2Y = (c2.topSlot + c2.spanSlots / 2) * SLOT_H
      const pY  = (p.topSlot  + p.spanSlots  / 2) * SLOT_H
      const px  = p.colIndex  * COL_STEP
      return [
        `M${cx + COL_W},${c1Y}H${mid}`,
        `M${cx + COL_W},${c2Y}H${mid}`,
        `M${mid},${c1Y}V${c2Y}`,
        `M${mid},${pY}H${px}`,
      ]
    }), [],
  )

  return (
    <div className="overflow-x-auto pb-6 -mx-4 px-4">
      {/* Column headers */}
      <div style={{ minWidth: TOTAL_W }} className="flex mb-2">
        {COL_LABELS.map((label, i) => (
          <div
            key={i}
            style={{ width: COL_W, marginLeft: i > 0 ? COL_GAP : 0 }}
            className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-center truncate"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Bracket grid */}
      <div style={{ minWidth: TOTAL_W, position: 'relative', height: TOTAL_H }}>
        {/* SVG connector lines */}
        <svg
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          viewBox={`0 0 ${TOTAL_W} ${TOTAL_H}`}
          xmlns="http://www.w3.org/2000/svg"
        >
          {connectors.map((d, i) => (
            <path key={i} d={d} fill="none" stroke="#2d3f55" strokeWidth="1.5" strokeLinecap="round" />
          ))}
        </svg>

        {/* Match cards */}
        {Object.entries(BP).map(([mid, pos]) => {
          const match = matchMap[mid]
          if (!match) return null
          const x = pos.colIndex * COL_STEP
          const y = (pos.topSlot + pos.spanSlots / 2) * SLOT_H - CARD_H / 2
          return (
            <div key={mid} style={{ position: 'absolute', top: y, left: x, width: COL_W, height: CARD_H }}>
              <TreeCard match={match} teamMap={teamMap} proj={projected[mid]} />
            </div>
          )
        })}
      </div>

      {/* Third place playoff */}
      {matchMap['m103'] && (
        <div style={{ minWidth: TOTAL_W }} className="mt-6 flex items-center gap-4">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider shrink-0 w-20">
            3rd Place
          </span>
          <div style={{ width: COL_W }}>
            <TreeCard match={matchMap['m103']} teamMap={teamMap} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Compact card (tree view) ──────────────────────────────────────────────
function TreeCard({ match, teamMap, proj }: { match: Match; teamMap: TMap; proj?: Proj }) {
  const fin  = match.status === 'FINISHED'
  const live = match.status === 'LIVE'
  const homeId = match.homeTeamId !== 'TBD' ? match.homeTeamId : proj?.home?.teamId
  const awayId = match.awayTeamId !== 'TBD' ? match.awayTeamId : proj?.away?.teamId
  const home = homeId ? teamMap[homeId] : undefined
  const away = awayId ? teamMap[awayId] : undefined
  const hProj = match.homeTeamId === 'TBD' && !!proj?.home && !proj?.homeConfirmed
  const aProj = match.awayTeamId === 'TBD' && !!proj?.away && !proj?.awayConfirmed
  const hWins = fin && !!homeId && match.winnerTeamId === homeId
  const aWins = fin && !!awayId && match.winnerTeamId === awayId
  const pen   = fin && match.homeScore !== null && match.awayScore !== null
    && match.homeScore === match.awayScore && !!match.winnerTeamId

  const time = new Date(match.scheduledKickoffUtc).toLocaleString('en-GB', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bucharest',
  })

  const border = live ? 'border-green-500/50' : hProj || aProj ? 'border-amber-600/40 border-dashed' : 'border-slate-700'

  const nameCls = (wins: boolean, isProj: boolean, hasTeam: boolean) =>
    !hasTeam ? 'text-slate-500 italic'
    : wins   ? 'text-white font-semibold'
    : fin    ? 'text-slate-500'
    : isProj ? 'text-amber-300/90'
    :           'text-slate-200'

  return (
    <div className={`flex flex-col bg-slate-800 rounded border overflow-hidden ${border}`} style={{ height: CARD_H }}>
      {/* Home */}
      <div className={`flex items-center gap-1.5 px-2 flex-1 border-b border-slate-700/40 min-w-0 ${hWins ? 'bg-blue-600/10' : ''}`}>
        <span className="text-sm leading-none shrink-0">{home?.flagEmoji ?? '🏳'}</span>
        <span className={`flex-1 truncate text-[11px] leading-tight ${nameCls(hWins, hProj, !!home)}`}>
          {home?.shortName ?? 'TBD'}
        </span>
        {hProj && <span className="text-[8px] text-amber-500/50 shrink-0">~</span>}
        {match.homeScore !== null && (
          <span className={`tabular-nums text-xs shrink-0 font-semibold ${hWins ? 'text-white' : 'text-slate-400'}`}>
            {match.homeScore}
          </span>
        )}
      </div>
      {/* Away */}
      <div className={`flex items-center gap-1.5 px-2 flex-1 border-b border-slate-700/40 min-w-0 ${aWins ? 'bg-blue-600/10' : ''}`}>
        <span className="text-sm leading-none shrink-0">{away?.flagEmoji ?? '🏳'}</span>
        <span className={`flex-1 truncate text-[11px] leading-tight ${nameCls(aWins, aProj, !!away)}`}>
          {away?.shortName ?? 'TBD'}
        </span>
        {aProj && <span className="text-[8px] text-amber-500/50 shrink-0">~</span>}
        {match.awayScore !== null && (
          <span className={`tabular-nums text-xs shrink-0 font-semibold ${aWins ? 'text-white' : 'text-slate-400'}`}>
            {match.awayScore}
          </span>
        )}
      </div>
      {/* Footer */}
      <div className="flex items-center justify-between px-2 text-[9px] text-slate-500 shrink-0" style={{ height: 18 }}>
        <span className="truncate max-w-[112px]">{match.city}</span>
        {live ? <span className="text-green-400 font-semibold">LIVE</span>
        : fin  ? <span>{pen ? 'PEN' : 'FT'}</span>
        :        <span className="shrink-0">{time}</span>}
      </div>
    </div>
  )
}

// ─── Rounds tab view ───────────────────────────────────────────────────────
function pickDefault(mbr: Partial<Record<MatchRound, Match[]>>): MatchRound {
  for (const { round } of ROUND_CONFIG) if (mbr[round]?.some(m => m.status === 'LIVE')) return round
  for (const { round } of ROUND_CONFIG) if (mbr[round]?.some(m => m.status === 'SCHEDULED')) return round
  for (let i = ROUND_CONFIG.length - 1; i >= 0; i--) if (mbr[ROUND_CONFIG[i].round]?.length) return ROUND_CONFIG[i].round
  return 'ROUND_OF_32'
}

function RoundsView({ matches, teamMap, projected, selectedRound, onSelectRound }: {
  matches: Match[]; teamMap: TMap; projected: ProjMap
  selectedRound: MatchRound | null; onSelectRound: (r: MatchRound) => void
}) {
  const mbr = useMemo(() => {
    const m: Partial<Record<MatchRound, Match[]>> = {}
    for (const { round } of ROUND_CONFIG) {
      const ms = matches
        .filter(x => x.round === round)
        .sort((a, b) => a.scheduledKickoffUtc.localeCompare(b.scheduledKickoffUtc))
      if (ms.length) m[round] = ms
    }
    return m
  }, [matches])

  const defaultRound = useMemo(() => pickDefault(mbr), [mbr])
  const round = selectedRound ?? defaultRound
  const current = mbr[round] ?? []
  const label = ROUND_CONFIG.find(r => r.round === round)?.label ?? ''
  const done  = current.filter(m => m.status === 'FINISHED').length
  const live  = current.some(m => m.status === 'LIVE')

  const cols =
    round === 'FINAL' || round === 'THIRD_PLACE'        ? 'grid-cols-1 max-w-sm mx-auto' :
    round === 'SEMI_FINAL' || round === 'QUARTER_FINAL' ? 'grid-cols-1 sm:grid-cols-2' :
                                                           'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
  return (
    <div className="max-w-5xl mx-auto">
      {/* Tabs */}
      <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
        {ROUND_CONFIG.filter(r => mbr[r.round]).map(({ round: r, short }) => {
          const ms = mbr[r] ?? []
          const allDone = ms.length > 0 && ms.every(m => m.status === 'FINISHED')
          const hasLive = ms.some(m => m.status === 'LIVE')
          return (
            <button
              key={r}
              onClick={() => onSelectRound(r)}
              className={`relative shrink-0 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${r === round ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
            >
              {short}
              {hasLive && <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full animate-pulse" />}
              {allDone && !hasLive && <span className="ml-1 text-[10px] opacity-50">✓</span>}
            </button>
          )
        })}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          {round === 'FINAL' && <span>🏆</span>}{label}
        </h2>
        <div className="flex items-center gap-3 text-xs">
          {live && (
            <span className="flex items-center gap-1.5 text-green-400 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />LIVE
            </span>
          )}
          <span className="text-slate-500">{done}/{current.length} complete</span>
        </div>
      </div>

      {/* Grid */}
      <div className={`grid gap-3 ${cols}`}>
        {current.map(m => <FullCard key={m.id} match={m} teamMap={teamMap} proj={projected[m.id]} />)}
      </div>
    </div>
  )
}

// ─── Full card (rounds view) ───────────────────────────────────────────────
function FullCard({ match, teamMap, proj }: { match: Match; teamMap: TMap; proj?: Proj }) {
  const fin  = match.status === 'FINISHED'
  const live = match.status === 'LIVE'
  const homeId = match.homeTeamId !== 'TBD' ? match.homeTeamId : proj?.home?.teamId
  const awayId = match.awayTeamId !== 'TBD' ? match.awayTeamId : proj?.away?.teamId
  const home = homeId ? teamMap[homeId] : undefined
  const away = awayId ? teamMap[awayId] : undefined
  const hProj = match.homeTeamId === 'TBD' && !!proj?.home && !proj?.homeConfirmed
  const aProj = match.awayTeamId === 'TBD' && !!proj?.away && !proj?.awayConfirmed
  const hWins = fin && !!homeId && match.winnerTeamId === homeId
  const aWins = fin && !!awayId && match.winnerTeamId === awayId
  const pen   = fin && match.homeScore !== null && match.awayScore !== null
    && match.homeScore === match.awayScore && !!match.winnerTeamId

  const kickoffTime = new Date(match.scheduledKickoffUtc)
    .toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bucharest' })
  const kickoffFull = new Date(match.scheduledKickoffUtc).toLocaleString('en-GB', {
    weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bucharest',
  })

  const border = live ? 'border-green-500/50' : hProj || aProj ? 'border-amber-700/40 border-dashed' : 'border-slate-700'

  const rows = [
    { id: homeId, team: home, wins: hWins, isProj: hProj, score: match.homeScore },
    { id: awayId, team: away, wins: aWins, isProj: aProj, score: match.awayScore },
  ]

  return (
    <div className={`bg-slate-800 rounded-lg overflow-hidden border ${border}`}>
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-700/40 text-xs">
        <span className="text-slate-400 truncate">{match.city}</span>
        <span className={`shrink-0 ml-2 font-medium ${live ? 'text-green-400' : hProj || aProj ? 'text-amber-500/80' : 'text-slate-400'}`}>
          {live ? (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />LIVE
            </span>
          ) : fin ? (pen ? 'FT (pen)' : 'FT')
            : hProj || aProj ? `${proj!.homeSlot} · ${proj!.awaySlot}`
            : kickoffTime}
        </span>
      </div>

      <div className="px-3 py-2 space-y-1.5">
        {rows.map((t, i) => (
          <div key={i} className={`flex items-center justify-between gap-2 ${t.wins ? 'font-bold' : ''}`}>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xl leading-none">{t.team?.flagEmoji ?? '🏳'}</span>
              <span className={`text-sm truncate ${
                !t.team    ? 'text-slate-500 italic'
                : t.wins   ? 'text-white'
                : fin      ? 'text-slate-500'
                : t.isProj ? 'text-amber-300/90'
                :             'text-slate-300'
              }`}>
                {t.team?.shortName ?? 'TBD'}
              </span>
              {t.isProj && <span className="text-[9px] text-amber-500/60 font-semibold shrink-0">PROJ</span>}
            </div>
            {t.score !== null && (
              <span className={`tabular-nums text-sm shrink-0 ${t.wins ? 'text-white' : fin ? 'text-slate-500' : 'text-slate-300'}`}>
                {t.score}
              </span>
            )}
          </div>
        ))}
      </div>

      {!live && !fin && !(hProj || aProj) && (
        <div className="px-3 pb-2 text-xs text-slate-500 text-right">{kickoffFull}</div>
      )}
    </div>
  )
}
