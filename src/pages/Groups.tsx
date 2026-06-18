import { useData } from '../contexts/DataContext'
import type { GroupStanding, Match } from '../types'

const GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L']

function calcStandings(matches: Match[], group: string): GroupStanding[] {
  const relevant = matches.filter(
    m => m.round === 'GROUP' && m.group === group && (m.status === 'FINISHED' || m.status === 'LIVE'),
  )
  const map = new Map<string, GroupStanding>()

  const ensure = (teamId: string) => {
    if (!map.has(teamId)) {
      map.set(teamId, {
        teamId, group,
        played: 0, won: 0, drawn: 0, lost: 0,
        goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
        qualificationStatus: 'TBD',
      })
    }
    return map.get(teamId)!
  }

  // Ensure all 4 teams in group appear even with 0 matches played
  matches
    .filter(m => m.round === 'GROUP' && m.group === group && m.homeTeamId !== 'TBD')
    .forEach(m => { ensure(m.homeTeamId); ensure(m.awayTeamId) })

  for (const m of relevant) {
    if (m.homeScore === null || m.awayScore === null) continue
    const h = ensure(m.homeTeamId)
    const a = ensure(m.awayTeamId)
    h.played++; a.played++
    h.goalsFor += m.homeScore; h.goalsAgainst += m.awayScore
    a.goalsFor += m.awayScore; a.goalsAgainst += m.homeScore
    if (m.homeScore > m.awayScore) { h.won++; h.points += 3; a.lost++ }
    else if (m.homeScore < m.awayScore) { a.won++; a.points += 3; h.lost++ }
    else { h.drawn++; h.points++; a.drawn++; a.points++ }
    h.goalDifference = h.goalsFor - h.goalsAgainst
    a.goalDifference = a.goalsFor - a.goalsAgainst
  }

  return Array.from(map.values()).sort(
    (a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor
  )
}

export default function Groups() {
  const { matches, teamMap } = useData()

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-white mb-6">Group Stage</h1>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {GROUPS.map(g => {
          const standings = calcStandings(matches, g)
          const hasLive = matches.some(m => m.round === 'GROUP' && m.group === g && m.status === 'LIVE')
          return (
            <div key={g} className="bg-slate-800 rounded-lg overflow-hidden">
              <div className="bg-slate-700 px-4 py-2 font-bold text-white text-sm flex items-center justify-between">
                <span>Group {g}</span>
                {hasLive && (
                  <span className="flex items-center gap-1 text-green-400 text-xs font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                    LIVE
                  </span>
                )}
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-700">
                    <th className="text-left px-3 py-1.5 w-full">Team</th>
                    <th className="px-1.5 py-1.5">P</th>
                    <th className="px-1.5 py-1.5">W</th>
                    <th className="px-1.5 py-1.5">D</th>
                    <th className="px-1.5 py-1.5">L</th>
                    <th className="px-1.5 py-1.5">GD</th>
                    <th className="px-1.5 py-1.5 font-bold text-slate-300">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((s, i) => {
                    const team = teamMap[s.teamId]
                    const qualified = i < 2
                    return (
                      <tr
                        key={s.teamId}
                        className={`border-b border-slate-700/50 ${qualified && s.played > 0 ? 'bg-green-900/10' : ''}`}
                      >
                        <td className="px-3 py-1.5 flex items-center gap-1.5">
                          {qualified && s.played > 0 && (
                            <span className="w-1 h-4 bg-green-500 rounded-sm shrink-0" />
                          )}
                          <span>{team?.flagEmoji}</span>
                          <span className="text-white font-medium truncate">{team?.shortName ?? s.teamId}</span>
                        </td>
                        <td className="text-center px-1.5 py-1.5 text-slate-300">{s.played}</td>
                        <td className="text-center px-1.5 py-1.5 text-slate-300">{s.won}</td>
                        <td className="text-center px-1.5 py-1.5 text-slate-300">{s.drawn}</td>
                        <td className="text-center px-1.5 py-1.5 text-slate-300">{s.lost}</td>
                        <td className="text-center px-1.5 py-1.5 text-slate-300">
                          {s.goalDifference > 0 ? `+${s.goalDifference}` : s.goalDifference}
                        </td>
                        <td className="text-center px-1.5 py-1.5 font-bold text-white">{s.points}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        })}
      </div>
    </div>
  )
}
