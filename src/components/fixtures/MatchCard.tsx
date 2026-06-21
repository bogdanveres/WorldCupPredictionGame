import { useState, useEffect } from 'react'
import type { Match, Team } from '../../types'
import { formatKickoffDisplay } from '../../utils/timezone'
import PredictionForm from '../predictions/PredictionForm'
import MatchReactions, { type Reaction } from '../reactions/MatchReactions'

interface Props {
  match: Match
  homeTeam: Team | undefined
  awayTeam: Team | undefined
  showPrediction?: boolean
  isToday?: boolean
  reactions?: Reaction[]
  userNames?: Record<string, string>
}

export default function MatchCard({ match, homeTeam, awayTeam, showPrediction = true, isToday = false, reactions, userNames }: Props) {
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
            <div className={`text-2xl font-bold tracking-wider ${isLive ? 'text-green-400' : 'text-white'}`}>
              {match.homeScore} – {match.awayScore}
            </div>
          ) : (
            <div className="text-sm text-slate-300 text-center">
              {match.status === 'SCHEDULED'
                ? formatKickoffDisplay(match.scheduledKickoffUtc)
                : (match.status === 'POSTPONED' ? 'POSTPONED' : match.status)}
            </div>
          )}
          {match.status === 'SCHEDULED' && <Countdown kickoffUtc={match.scheduledKickoffUtc} />}
          {(match.status === 'SCHEDULED' || isLive || isFinished) && (
            <div className="text-xs text-slate-500 mt-0.5">{match.city}</div>
          )}
        </div>

        <TeamSide team={awayTeam} align="right" />
      </div>

      {showPrediction && match.homeTeamId !== 'TBD' && (
        <PredictionForm match={match} />
      )}

      {isFinished && reactions !== undefined && (
        <MatchReactions matchId={match.id} reactions={reactions} userNames={userNames} />
      )}
    </div>
  )
}

function Countdown({ kickoffUtc }: { kickoffUtc: string }) {
  const [label, setLabel] = useState<string | null>(null)

  useEffect(() => {
    const calc = () => {
      const diff = new Date(kickoffUtc).getTime() - Date.now()
      if (diff <= 0 || diff > 24 * 60 * 60 * 1000) {
        setLabel(null)
        return
      }
      const h = Math.floor(diff / 3_600_000)
      const m = Math.floor((diff % 3_600_000) / 60_000)
      setLabel(h > 0 ? `Closes in ${h}h ${m}m` : `Closes in ${m}m`)
    }
    calc()
    const id = setInterval(calc, 30_000)
    return () => clearInterval(id)
  }, [kickoffUtc])

  if (!label) return null
  return <div className="text-xs text-amber-400 mt-0.5 font-medium">{label}</div>
}

function TeamSide({ team, align }: { team: Team | undefined; align: 'left' | 'right' }) {
  return (
    <div className={`flex items-center gap-2 flex-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
      <span className="text-2xl leading-none">{team?.flagEmoji ?? '🏳'}</span>
      <span className="text-sm font-semibold text-white truncate">
        {team?.shortName ?? 'TBD'}
      </span>
    </div>
  )
}
