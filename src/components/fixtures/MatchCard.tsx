import type { Match, Team } from '../../types'
import { formatKickoffDisplay } from '../../utils/timezone'
import PredictionForm from '../predictions/PredictionForm'

interface Props {
  match: Match
  homeTeam: Team | undefined
  awayTeam: Team | undefined
  showPrediction?: boolean
  isToday?: boolean
}

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: '',
  LIVE: 'LIVE',
  FINISHED: 'FT',
  POSTPONED: 'POSTPONED',
  ABANDONED: 'ABA',
}

export default function MatchCard({ match, homeTeam, awayTeam, showPrediction = true, isToday = false }: Props) {
  const isFinished = match.status === 'FINISHED'
  const isLive = match.status === 'LIVE'
  const hasScore = match.homeScore !== null && match.awayScore !== null

  return (
    <div className={`rounded-lg p-4 flex flex-col gap-2 ${isToday ? 'bg-slate-800 ring-1 ring-amber-500/40' : 'bg-slate-800'}`}>
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>
          {match.group ? `Group ${match.group}` : match.round.replace(/_/g, ' ')}
        </span>
        {isLive ? (
          <span className="flex items-center gap-1 text-green-400 font-semibold">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block" />
            LIVE
          </span>
        ) : isFinished ? (
          <span className="text-slate-500">FT</span>
        ) : match.status === 'POSTPONED' ? (
          <span className="text-yellow-500">POSTPONED</span>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2">
        <TeamSide team={homeTeam} align="left" />

        <div className="flex flex-col items-center min-w-[64px]">
          {hasScore ? (
            <div className="text-2xl font-bold text-white tracking-wider">
              {match.homeScore} – {match.awayScore}
            </div>
          ) : (
            <div className="text-sm text-slate-300 text-center">
              {match.status === 'SCHEDULED'
                ? formatKickoffDisplay(match.scheduledKickoffUtc)
                : STATUS_LABEL[match.status] ?? match.status}
            </div>
          )}
          {match.status === 'SCHEDULED' && (
            <div className="text-xs text-slate-500 mt-0.5">{match.city}</div>
          )}
          {isFinished && (
            <div className="text-xs text-slate-500 mt-0.5">{match.city}</div>
          )}
        </div>

        <TeamSide team={awayTeam} align="right" />
      </div>

      {showPrediction && match.homeTeamId !== 'TBD' && (
        <PredictionForm match={match} />
      )}
    </div>
  )
}

function TeamSide({
  team,
  align,
}: {
  team: Team | undefined
  align: 'left' | 'right'
}) {
  return (
    <div
      className={`flex items-center gap-2 flex-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}
    >
      <span className="text-2xl leading-none">{team?.flagEmoji ?? '🏳'}</span>
      <span className="text-sm font-semibold text-white truncate">
        {team?.shortName ?? 'TBD'}
      </span>
    </div>
  )
}
