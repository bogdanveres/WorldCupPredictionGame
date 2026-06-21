import { useMemo, useState } from 'react'
import { useData } from '../contexts/DataContext'
import type { Match, MatchRound } from '../types'

// ─── Round config ──────────────────────────────────────────────────────────
const ROUND_CONFIG: { round: MatchRound; label: string; short: string }[] = [
  { round: 'ROUND_OF_32',   label: 'Round of 32',   short: 'R32'   },
  { round: 'ROUND_OF_16',   label: 'Round of 16',   short: 'R16'   },
  { round: 'QUARTER_FINAL', label: 'Quarter-finals', short: 'QF'    },
  { round: 'SEMI_FINAL',    label: 'Semi-finals',    short: 'SF'    },
  { round: 'THIRD_PLACE',   label: '3rd Place',      short: '3rd'   },
  { round: 'FINAL',         label: 'Final',          short: 'Final' },
]

const GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L'] as const

// R32 slot assignments: which group position fills each match slot.
// Adjacent-group pairing (A↔B, C↔D, …) with best-3rd-place play-offs at the end.
// Exact seedings confirmed by draw — this is a close approximation.
const R32_SLOTS: Record<string, [string, string]> = {
  m073: ['1A', '2B'], m074: ['1C', '2D'], m075: ['1E', '2F'],
  m076: ['1G', '2H'], m077: ['1I', '2J'], m078: ['1K', '2L'],
  m079: ['1B', '2A'], m080: ['1D', '2C'], m081: ['1F', '2E'],
  m082: ['1H', '2G'], m083: ['1J', '2I'], m084: ['1L', '2K'],
  m085: ['3rd-1', '3rd-2'], m086: ['3rd-3', '3rd-4'],
  m087: ['3rd-5', '3rd-6'], m088: ['3rd-7', '3rd-8'],
}

// ─── Standings computation ─────────────────────────────────────────────────
interface StandingEntry {
  teamId: string
  points: number
  goalDifference: number
  goalsFor: number
  played: number
  group: string
}

function computeStandings(matches: Match[]): {
  byGroup: Record<string, StandingEntry[]>
  best3rd: StandingEntry[]
} {
  const byGroup: Record<string, StandingEntry[]> = {}

  for (const group of GROUPS) {
    const map = new Map<string, StandingEntry>()
    matches
      .filter(m => m.round === 'GROUP' && m.group === group && m.homeTeamId !== 'TBD')
      .forEach(m => {
        if (!map.has(m.homeTeamId)) map.set(m.homeTeamId, { teamId: m.homeTeamId, points: 0, goalDifference: 0, goalsFor: 0, played: 0, group })
        if (!map.has(m.awayTeamId)) map.set(m.awayTeamId, { teamId: m.awayTeamId, points: 0, goalDifference: 0, goalsFor: 0, played: 0, group })
      })
    for (const m of matches) {
      if (m.round !== 'GROUP' || m.group !== group) continue
      if (m.status !== 'FINISHED' && m.status !== 'LIVE') continue
      if (m.homeScore === null || m.awayScore === null) continue
      const h = map.get(m.homeTeamId)
      const a = map.get(m.awayTeamId)
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

  // Best 3rd-place teams (only from groups that have played at least 1 match)
  const best3rd = GROUPS
    .map(g => byGroup[g]?.[2])
    .filter((e): e is StandingEntry => !!e && e.played > 0)
    .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor)

  return { byGroup, best3rd }
}

function resolveSlot(
  slot: string,
  byGroup: Record<string, StandingEntry[]>,
  best3rd: StandingEntry[],
): StandingEntry | undefined {
  if (slot.startsWith('3rd-')) {
    const rank = parseInt(slot.replace('3rd-', ''), 10) - 1
    const e = best3rd[rank]
    return e?.played > 0 ? e : undefined
  }
  const pos = parseInt(slot[0], 10) - 1  // 0-indexed
  const group = slot[1]
  const e = byGroup[group]?.[pos]
  return e?.played > 0 ? e : undefined  // only project once the group has results
}

// ─── Default round selection ───────────────────────────────────────────────
function pickDefaultRound(matchesByRound: Partial<Record<MatchRound, Match[]>>): MatchRound {
  for (const { round } of ROUND_CONFIG)
    if (matchesByRound[round]?.some(m => m.status === 'LIVE')) return round
  for (const { round } of ROUND_CONFIG)
    if (matchesByRound[round]?.some(m => m.status === 'SCHEDULED')) return round
  for (let i = ROUND_CONFIG.length - 1; i >= 0; i--)
    if (matchesByRound[ROUND_CONFIG[i].round]?.length) return ROUND_CONFIG[i].round
  return 'ROUND_OF_32'
}

// ─── Page ─────────────────────────────────────────────────────────────────
export default function Bracket() {
  const { matches, teamMap } = useData()
  const [selectedRound, setSelectedRound] = useState<MatchRound | null>(null)

  const standings = useMemo(() => computeStandings(matches), [matches])

  const matchesByRound = useMemo(() => {
    const map: Partial<Record<MatchRound, Match[]>> = {}
    for (const { round } of ROUND_CONFIG) {
      const ms = matches
        .filter(m => m.round === round)
        .sort((a, b) => a.scheduledKickoffUtc.localeCompare(b.scheduledKickoffUtc))
      if (ms.length) map[round] = ms
    }
    return map
  }, [matches])

  const defaultRound = useMemo(() => pickDefaultRound(matchesByRound), [matchesByRound])
  const round = selectedRound ?? defaultRound

  const availableRounds = ROUND_CONFIG.filter(r => matchesByRound[r.round])
  const currentMatches = matchesByRound[round] ?? []
  const roundLabel = ROUND_CONFIG.find(r => r.round === round)?.label ?? ''
  const completed = currentMatches.filter(m => m.status === 'FINISHED').length
  const total = currentMatches.length
  const hasLive = currentMatches.some(m => m.status === 'LIVE')

  // Build projected teams for TBD R32 slots
  const projected = useMemo(() => {
    if (round !== 'ROUND_OF_32') return {}
    const map: Record<string, { homeSlot: string; awaySlot: string; home?: StandingEntry; away?: StandingEntry }> = {}
    for (const m of currentMatches) {
      const slots = R32_SLOTS[m.id]
      if (!slots) continue
      if (m.homeTeamId !== 'TBD' && m.awayTeamId !== 'TBD') continue
      map[m.id] = {
        homeSlot: slots[0],
        awaySlot: slots[1],
        home: m.homeTeamId === 'TBD' ? resolveSlot(slots[0], standings.byGroup, standings.best3rd) : undefined,
        away: m.awayTeamId === 'TBD' ? resolveSlot(slots[1], standings.byGroup, standings.best3rd) : undefined,
      }
    }
    return map
  }, [round, currentMatches, standings])

  const anyProjected = Object.keys(projected).length > 0

  const cols =
    round === 'FINAL' || round === 'THIRD_PLACE' ? 'grid-cols-1 max-w-sm mx-auto' :
    round === 'SEMI_FINAL' || round === 'QUARTER_FINAL' ? 'grid-cols-1 sm:grid-cols-2' :
    'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-white mb-4">Knockout Stage</h1>

      {/* Round tabs */}
      <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
        {availableRounds.map(({ round: r, short }) => {
          const ms = matchesByRound[r] ?? []
          const allDone = ms.length > 0 && ms.every(m => m.status === 'FINISHED')
          const live = ms.some(m => m.status === 'LIVE')
          const isSelected = r === round
          return (
            <button
              key={r}
              onClick={() => setSelectedRound(r)}
              className={`relative shrink-0 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isSelected ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {short}
              {live && <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full animate-pulse" />}
              {allDone && !live && <span className="ml-1 text-[10px] opacity-50">✓</span>}
            </button>
          )
        })}
      </div>

      {/* Round header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          {round === 'FINAL' && <span>🏆</span>}
          {roundLabel}
        </h2>
        <div className="flex items-center gap-3 text-xs">
          {hasLive && (
            <span className="flex items-center gap-1.5 text-green-400 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              LIVE
            </span>
          )}
          <span className="text-slate-500">{completed}/{total} complete</span>
        </div>
      </div>

      {/* Projection notice */}
      {anyProjected && (
        <p className="text-xs text-amber-500/70 mb-3">
          ⚠ Amber teams are projected from current group standings — confirmed after Jun 25–26
        </p>
      )}

      {/* Match grid */}
      <div className={`grid gap-3 ${cols}`}>
        {currentMatches.map(m => (
          <BracketMatch key={m.id} match={m} teamMap={teamMap} proj={projected[m.id]} />
        ))}
      </div>
    </div>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function kickoffLabel(utc: string) {
  const d = new Date(utc)
  const date = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Bucharest' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bucharest' })
  return `${date} · ${time}`
}

// ─── BracketMatch ──────────────────────────────────────────────────────────
function BracketMatch({
  match,
  teamMap,
  proj,
}: {
  match: Match
  teamMap: Record<string, { flagEmoji: string; shortName: string }>
  proj?: { homeSlot: string; awaySlot: string; home?: StandingEntry; away?: StandingEntry }
}) {
  const isFinished = match.status === 'FINISHED'
  const isLive = match.status === 'LIVE'

  // Use confirmed team, or fall back to projected, or TBD
  const homeId = match.homeTeamId !== 'TBD' ? match.homeTeamId : proj?.home?.teamId
  const awayId = match.awayTeamId !== 'TBD' ? match.awayTeamId : proj?.away?.teamId
  const home = homeId ? teamMap[homeId] : undefined
  const away = awayId ? teamMap[awayId] : undefined

  const homeProj = match.homeTeamId === 'TBD' && !!proj?.home
  const awayProj = match.awayTeamId === 'TBD' && !!proj?.away
  const hasProj = homeProj || awayProj

  const homeWins = isFinished && match.winnerTeamId === homeId
  const awayWins = isFinished && match.winnerTeamId === awayId
  const wentToPen = isFinished && match.homeScore !== null && match.awayScore !== null
    && match.homeScore === match.awayScore && match.winnerTeamId !== null

  return (
    <div className={`bg-slate-800 rounded-lg overflow-hidden border ${
      isLive ? 'border-green-500/50' :
      hasProj ? 'border-amber-700/40 border-dashed' :
      'border-slate-700'
    }`}>
      {/* Card header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-700/40 text-xs">
        <span className="text-slate-400 truncate">{match.city}</span>
        <span className={`shrink-0 ml-2 font-medium ${isLive ? 'text-green-400' : hasProj ? 'text-amber-500/80' : 'text-slate-400'}`}>
          {isLive ? (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />LIVE
            </span>
          ) : isFinished ? (
            wentToPen ? 'FT (pen)' : 'FT'
          ) : hasProj ? (
            `${proj!.homeSlot} · ${proj!.awaySlot}`
          ) : (
            kickoffLabel(match.scheduledKickoffUtc)
          )}
        </span>
      </div>

      {/* Teams */}
      <div className="px-3 py-2 space-y-1.5">
        <TeamRow
          flag={home?.flagEmoji}
          name={home?.shortName ?? 'TBD'}
          score={match.homeScore}
          isWinner={homeWins}
          isLoser={isFinished && !homeWins}
          isTbd={!home}
          isLive={isLive}
          isProjected={homeProj}
        />
        <div className="border-t border-slate-700/50" />
        <TeamRow
          flag={away?.flagEmoji}
          name={away?.shortName ?? 'TBD'}
          score={match.awayScore}
          isWinner={awayWins}
          isLoser={isFinished && !awayWins}
          isTbd={!away}
          isLive={isLive}
          isProjected={awayProj}
        />
      </div>

      {/* Date for scheduled confirmed matches */}
      {!isLive && !isFinished && !hasProj && (
        <div className="px-3 pb-2 text-xs text-slate-500 text-right">
          {kickoffLabel(match.scheduledKickoffUtc)}
        </div>
      )}
    </div>
  )
}

function TeamRow({
  flag, name, score, isWinner, isLoser, isTbd, isLive, isProjected,
}: {
  flag: string | undefined; name: string; score: number | null
  isWinner: boolean; isLoser: boolean; isTbd: boolean; isLive: boolean; isProjected: boolean
}) {
  return (
    <div className={`flex items-center justify-between gap-2 ${isWinner ? 'font-bold' : ''}`}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xl leading-none">{isTbd ? '🏳' : (flag ?? '🏳')}</span>
        <span className={`text-sm truncate ${
          isTbd        ? 'text-slate-500 italic' :
          isWinner     ? 'text-white' :
          isLoser      ? 'text-slate-500' :
          isLive       ? 'text-green-300' :
          isProjected  ? 'text-amber-300/90' :
                         'text-slate-300'
        }`}>
          {name}
        </span>
        {isProjected && !isTbd && (
          <span className="text-[9px] text-amber-500/60 font-semibold shrink-0 leading-none">PROJ</span>
        )}
      </div>
      {score !== null && (
        <span className={`tabular-nums text-sm shrink-0 ${isWinner ? 'text-white' : isLoser ? 'text-slate-500' : 'text-slate-300'}`}>
          {score}
        </span>
      )}
    </div>
  )
}
