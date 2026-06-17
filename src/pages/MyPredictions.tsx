import { useState, useEffect } from 'react'
import { useAuth } from '../components/auth/AuthProvider'
import { getUserPredictions } from '../services/firestorePredictions'
import { useData } from '../contexts/DataContext'
import MatchCard from '../components/fixtures/MatchCard'
import type { Prediction } from '../types'
import { formatKickoffDisplay, isBeforeKickoff } from '../utils/timezone'
import { Link } from 'react-router-dom'

const POINTS_COLOR: Record<number, string> = {
  5: 'text-yellow-400',
  3: 'text-green-400',
  2: 'text-blue-400',
  1: 'text-slate-300',
  0: 'text-red-400',
}

export default function MyPredictions() {
  const { user } = useAuth()
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [loading, setLoading] = useState(true)
  const { getMatches, teamMap } = useData()
  const matches = getMatches()

  useEffect(() => {
    if (!user) return
    getUserPredictions(user.uid)
      .then(setPredictions)
      .finally(() => setLoading(false))
  }, [user])

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-slate-400">Sign in to view your predictions.</p>
        <Link to="/login" className="text-blue-400 hover:underline mt-2 inline-block">Sign in</Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-slate-800 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const predMap = Object.fromEntries(predictions.map(p => [p.matchId, p]))
  const groupMatches = matches.filter(m => m.round === 'GROUP' && m.homeTeamId !== 'TBD')

  const upcomingMatches = groupMatches.filter(
    m => m.status !== 'LIVE' && m.status !== 'FINISHED' && m.status !== 'ABANDONED' && isBeforeKickoff(m.scheduledKickoffUtc),
  )
  const pastMatches = groupMatches.filter(
    m => m.status === 'LIVE' || m.status === 'FINISHED' || m.status === 'ABANDONED' || !isBeforeKickoff(m.scheduledKickoffUtc),
  )

  const totalPoints = predictions.reduce((s, p) => s + (p.pointsAwarded ?? 0), 0)
  const exactScores = predictions.filter(p => p.pointsAwarded === 5 || p.pointsAwarded === 2).length
  const submitted = predictions.length
  const missing = upcomingMatches.filter(m => !predMap[m.id]).length

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-white mb-2">My Predictions</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Points" value={totalPoints} color="text-yellow-400" />
        <StatCard label="Submitted" value={submitted} color="text-blue-400" />
        <StatCard label="Exact Scores" value={exactScores} color="text-green-400" />
        <StatCard label="Still to predict" value={missing} color="text-red-400" />
      </div>

      {upcomingMatches.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Upcoming — add or edit predictions
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {upcomingMatches.map(m => (
              <MatchCard
                key={m.id}
                match={m}
                homeTeam={teamMap[m.homeTeamId]}
                awayTeam={teamMap[m.awayTeamId]}
              />
            ))}
          </div>
        </section>
      )}

      {pastMatches.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Results
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-xs uppercase tracking-wider border-b border-slate-700">
                  <th className="text-left py-2 pr-4">Match</th>
                  <th className="text-center py-2 px-2">Result</th>
                  <th className="text-center py-2 px-2">Prediction</th>
                  <th className="text-center py-2 px-2">Points</th>
                </tr>
              </thead>
              <tbody>
                {pastMatches.map(m => {
                  const pred = predMap[m.id]
                  const home = teamMap[m.homeTeamId]
                  const away = teamMap[m.awayTeamId]
                  const isFinished = m.status === 'FINISHED'

                  return (
                    <tr key={m.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-1.5">
                          <span className="text-base leading-none">{home?.flagEmoji}</span>
                          <span className="text-white font-medium">{home?.shortName}</span>
                          <span className="text-slate-500 text-xs">vs</span>
                          <span className="text-white font-medium">{away?.shortName}</span>
                          <span className="text-base leading-none">{away?.flagEmoji}</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {isFinished ? `Grp ${m.group}` : formatKickoffDisplay(m.scheduledKickoffUtc)}
                        </div>
                      </td>

                      <td className="text-center py-2.5 px-2">
                        {isFinished ? (
                          <span className="text-white font-semibold">
                            {m.homeScore}–{m.awayScore}
                          </span>
                        ) : (
                          <span className="text-slate-500 text-xs">
                            {m.status === 'LIVE' ? '🟢 LIVE' : '–'}
                          </span>
                        )}
                      </td>

                      <td className="text-center py-2.5 px-2">
                        {pred ? (
                          <span className="font-semibold text-slate-300">
                            {pred.predictedHomeScore}–{pred.predictedAwayScore}
                            {pred.isManualEntry && <span className="text-xs text-slate-500 ml-1">(M)</span>}
                          </span>
                        ) : (
                          <span className="text-slate-600 text-xs">–</span>
                        )}
                      </td>

                      <td className="text-center py-2.5 px-2">
                        {pred?.pointsAwarded !== null && pred?.pointsAwarded !== undefined ? (
                          <span className={`font-bold ${POINTS_COLOR[pred.pointsAwarded] ?? 'text-white'}`}>
                            {pred.pointsAwarded}
                          </span>
                        ) : isFinished && !pred ? (
                          <span className="text-red-500 font-bold">0</span>
                        ) : (
                          <span className="text-slate-600">–</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-slate-800 rounded-lg p-3 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-400 mt-0.5">{label}</div>
    </div>
  )
}
