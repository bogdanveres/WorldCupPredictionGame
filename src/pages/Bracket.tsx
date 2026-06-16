import { useData } from '../contexts/DataContext'
import type { Match, MatchRound } from '../types'

const ROUNDS: { round: MatchRound; label: string }[] = [
  { round: 'ROUND_OF_32', label: 'Round of 32' },
  { round: 'ROUND_OF_16', label: 'Round of 16' },
  { round: 'QUARTER_FINAL', label: 'Quarter-finals' },
  { round: 'SEMI_FINAL', label: 'Semi-finals' },
  { round: 'THIRD_PLACE', label: '3rd Place' },
  { round: 'FINAL', label: 'Final' },
]

export default function Bracket() {
  const { matches, teamMap } = useData()

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-white mb-6">Knockout Bracket</h1>

      <div className="space-y-8">
        {ROUNDS.map(({ round, label }) => {
          const roundMatches = matches
            .filter(m => m.round === round)
            .sort((a, b) => a.scheduledKickoffUtc.localeCompare(b.scheduledKickoffUtc))

          if (roundMatches.length === 0) return null

          return (
            <div key={round}>
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
                {label}
              </h2>
              <div className={`grid gap-3 ${
                round === 'ROUND_OF_32' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' :
                round === 'ROUND_OF_16' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' :
                round === 'QUARTER_FINAL' ? 'grid-cols-1 sm:grid-cols-2' :
                'grid-cols-1 sm:grid-cols-2'
              }`}>
                {roundMatches.map(m => (
                  <BracketMatch key={m.id} match={m} teamMap={teamMap} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function BracketMatch({
  match,
  teamMap,
}: {
  match: Match
  teamMap: Record<string, { flagEmoji: string; shortName: string; name: string }>
}) {
  const home = teamMap[match.homeTeamId]
  const away = teamMap[match.awayTeamId]
  const isFinished = match.status === 'FINISHED'
  const isLive = match.status === 'LIVE'
  const isTbd = match.homeTeamId === 'TBD'

  const kickoffDate = new Date(match.scheduledKickoffUtc).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short',
  })

  return (
    <div className={`bg-slate-800 rounded-lg overflow-hidden border ${
      isLive ? 'border-green-500/50' : 'border-slate-700'
    }`}>
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-700/50 text-xs text-slate-400">
        <span>{match.city}</span>
        <div className="flex items-center gap-1.5">
          {isLive && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
          <span>{isLive ? 'LIVE' : isFinished ? 'FT' : kickoffDate}</span>
        </div>
      </div>

      <div className="px-3 py-2 space-y-1.5">
        <BracketTeam
          flag={home?.flagEmoji ?? '🏳'}
          name={home?.shortName ?? (isTbd ? 'TBD' : match.homeTeamId)}
          score={match.homeScore}
          winner={isFinished && match.homeScore !== null && match.awayScore !== null && match.homeScore > match.awayScore}
          isTbd={isTbd}
        />
        <div className="border-t border-slate-700/50" />
        <BracketTeam
          flag={away?.flagEmoji ?? '🏳'}
          name={away?.shortName ?? (isTbd ? 'TBD' : match.awayTeamId)}
          score={match.awayScore}
          winner={isFinished && match.homeScore !== null && match.awayScore !== null && match.awayScore > match.homeScore}
          isTbd={isTbd}
        />
      </div>
    </div>
  )
}

function BracketTeam({
  flag, name, score, winner, isTbd,
}: {
  flag: string; name: string; score: number | null; winner: boolean; isTbd: boolean
}) {
  return (
    <div className={`flex items-center justify-between gap-2 ${winner ? 'font-bold' : ''}`}>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-base leading-none">{isTbd ? '❓' : flag}</span>
        <span className={`text-sm truncate ${isTbd ? 'text-slate-500 italic' : winner ? 'text-white' : 'text-slate-300'}`}>
          {name}
        </span>
      </div>
      {score !== null && (
        <span className={`text-sm shrink-0 ${winner ? 'text-white' : 'text-slate-400'}`}>
          {score}
        </span>
      )}
    </div>
  )
}
