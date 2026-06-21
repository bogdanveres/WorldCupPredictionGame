import { useMemo, useState } from 'react'
import { useData } from '../contexts/DataContext'
import type { Match, MatchRound } from '../types'

const ROUND_CONFIG: { round: MatchRound; label: string; short: string }[] = [
  { round: 'ROUND_OF_32',   label: 'Round of 32',   short: 'R32'   },
  { round: 'ROUND_OF_16',   label: 'Round of 16',   short: 'R16'   },
  { round: 'QUARTER_FINAL', label: 'Quarter-finals', short: 'QF'    },
  { round: 'SEMI_FINAL',    label: 'Semi-finals',    short: 'SF'    },
  { round: 'THIRD_PLACE',   label: '3rd Place',      short: '3rd'   },
  { round: 'FINAL',         label: 'Final',          short: 'Final' },
]

function pickDefaultRound(matchesByRound: Partial<Record<MatchRound, Match[]>>): MatchRound {
  for (const { round } of ROUND_CONFIG)
    if (matchesByRound[round]?.some(m => m.status === 'LIVE')) return round
  for (const { round } of ROUND_CONFIG)
    if (matchesByRound[round]?.some(m => m.status === 'SCHEDULED')) return round
  for (let i = ROUND_CONFIG.length - 1; i >= 0; i--)
    if (matchesByRound[ROUND_CONFIG[i].round]?.length) return ROUND_CONFIG[i].round
  return 'ROUND_OF_32'
}

export default function Bracket() {
  const { matches, teamMap } = useData()
  const [selectedRound, setSelectedRound] = useState<MatchRound | null>(null)

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

  const cols =
    round === 'FINAL' || round === 'THIRD_PLACE' ? 'grid-cols-1 max-w-sm mx-auto' :
    round === 'SEMI_FINAL' || round === 'QUARTER_FINAL' ? 'grid-cols-1 sm:grid-cols-2' :
    'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-white mb-4">Knockout Stage</h1>

      {/* Round tabs */}
      <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1 scrollbar-hide">
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
                isSelected
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {short}
              {live && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              )}
              {allDone && !live && (
                <span className="ml-1 text-[10px] opacity-50">✓</span>
              )}
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

      {/* Match grid */}
      <div className={`grid gap-3 ${cols}`}>
        {currentMatches.map(m => (
          <BracketMatch key={m.id} match={m} teamMap={teamMap} />
        ))}
      </div>
    </div>
  )
}

function kickoffLabel(utc: string) {
  const d = new Date(utc)
  const date = d.toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Bucharest',
  })
  const time = d.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bucharest',
  })
  return `${date} · ${time}`
}

function BracketMatch({
  match,
  teamMap,
}: {
  match: Match
  teamMap: Record<string, { flagEmoji: string; shortName: string }>
}) {
  const home = teamMap[match.homeTeamId]
  const away = teamMap[match.awayTeamId]
  const isFinished = match.status === 'FINISHED'
  const isLive = match.status === 'LIVE'

  const homeWins = isFinished && match.winnerTeamId === match.homeTeamId
  const awayWins = isFinished && match.winnerTeamId === match.awayTeamId
  // Tied score but winner = decided by penalties
  const wentToPen =
    isFinished &&
    match.homeScore !== null &&
    match.awayScore !== null &&
    match.homeScore === match.awayScore &&
    match.winnerTeamId !== null

  return (
    <div className={`bg-slate-800 rounded-lg overflow-hidden border ${
      isLive ? 'border-green-500/50' : 'border-slate-700'
    }`}>
      {/* Card header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-700/40 text-xs text-slate-400">
        <span className="truncate">{match.city}</span>
        <span className={`shrink-0 ml-2 font-medium ${isLive ? 'text-green-400' : ''}`}>
          {isLive ? (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              LIVE
            </span>
          ) : isFinished ? (
            wentToPen ? 'FT (pen)' : 'FT'
          ) : (
            kickoffLabel(match.scheduledKickoffUtc)
          )}
        </span>
      </div>

      {/* Teams */}
      <div className="px-3 py-2 space-y-1.5">
        <TeamRow
          flag={home?.flagEmoji}
          name={home?.shortName ?? (match.homeTeamId === 'TBD' ? 'TBD' : match.homeTeamId)}
          score={match.homeScore}
          isWinner={homeWins}
          isLoser={isFinished && !homeWins}
          isTbd={match.homeTeamId === 'TBD'}
          isLive={isLive}
        />
        <div className="border-t border-slate-700/50" />
        <TeamRow
          flag={away?.flagEmoji}
          name={away?.shortName ?? (match.awayTeamId === 'TBD' ? 'TBD' : match.awayTeamId)}
          score={match.awayScore}
          isWinner={awayWins}
          isLoser={isFinished && !awayWins}
          isTbd={match.awayTeamId === 'TBD'}
          isLive={isLive}
        />
      </div>
    </div>
  )
}

function TeamRow({
  flag, name, score, isWinner, isLoser, isTbd, isLive,
}: {
  flag: string | undefined
  name: string
  score: number | null
  isWinner: boolean
  isLoser: boolean
  isTbd: boolean
  isLive: boolean
}) {
  return (
    <div className={`flex items-center justify-between gap-2 ${isWinner ? 'font-bold' : ''}`}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xl leading-none">{isTbd ? '🏳' : (flag ?? '🏳')}</span>
        <span className={`text-sm truncate ${
          isTbd          ? 'text-slate-500 italic' :
          isWinner       ? 'text-white' :
          isLoser        ? 'text-slate-500' :
          isLive         ? 'text-green-300' :
                           'text-slate-300'
        }`}>
          {name}
        </span>
      </div>
      {score !== null && (
        <span className={`tabular-nums text-sm shrink-0 ${
          isWinner ? 'text-white' : isLoser ? 'text-slate-500' : 'text-slate-300'
        }`}>
          {score}
        </span>
      )}
    </div>
  )
}
