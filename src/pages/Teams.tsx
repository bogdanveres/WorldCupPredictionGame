import { useMemo, useState } from 'react'
import { useData } from '../contexts/DataContext'
import type { Match } from '../types'

const GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L'] as const
const CONFS  = ['ALL','UEFA','CONMEBOL','CONCACAF','CAF','AFC','OFC'] as const
type Conf    = typeof CONFS[number]
type SortKey = 'pts' | 'gd' | 'gf' | 'ga' | 'played' | 'won' | 'drawn' | 'lost'
type SortDir = 'asc' | 'desc'

interface TeamStat {
  teamId: string
  group: string
  groupRank: number
  groupComplete: boolean
  isLive: boolean
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  points: number
}

function computeAllStats(matches: Match[]): TeamStat[] {
  const result: TeamStat[] = []

  for (const group of GROUPS) {
    const gm = matches.filter(m => m.round === 'GROUP' && m.group === group)
    const groupComplete = gm.length === 6 && gm.every(m => m.status === 'FINISHED')
    const liveTeams = new Set(
      gm.filter(m => m.status === 'LIVE').flatMap(m => [m.homeTeamId, m.awayTeamId]),
    )

    const map = new Map<string, TeamStat>()
    gm.filter(m => m.homeTeamId !== 'TBD').forEach(m => {
      const base = { group, groupRank: 0, groupComplete, isLive: false, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 }
      if (!map.has(m.homeTeamId)) map.set(m.homeTeamId, { teamId: m.homeTeamId, ...base })
      if (!map.has(m.awayTeamId)) map.set(m.awayTeamId, { teamId: m.awayTeamId, ...base })
    })

    for (const m of gm) {
      if ((m.status !== 'FINISHED' && m.status !== 'LIVE') || m.homeScore === null || m.awayScore === null) continue
      const h = map.get(m.homeTeamId), a = map.get(m.awayTeamId)
      if (!h || !a) continue
      h.played++; a.played++
      h.goalsFor  += m.homeScore; h.goalsAgainst += m.awayScore
      a.goalsFor  += m.awayScore; a.goalsAgainst += m.homeScore
      h.goalDifference = h.goalsFor - h.goalsAgainst
      a.goalDifference = a.goalsFor - a.goalsAgainst
      if (m.homeScore > m.awayScore) { h.won++; h.points += 3; a.lost++ }
      else if (m.awayScore > m.homeScore) { a.won++; a.points += 3; h.lost++ }
      else { h.drawn++; h.points++; a.drawn++; a.points++ }
    }

    const sorted = Array.from(map.values()).sort(
      (a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor,
    )
    sorted.forEach((s, i) => result.push({ ...s, groupRank: i + 1, isLive: liveTeams.has(s.teamId) }))
  }

  return result
}

function getVal(s: TeamStat, key: SortKey): number {
  switch (key) {
    case 'pts':    return s.points
    case 'gd':     return s.goalDifference
    case 'gf':     return s.goalsFor
    case 'ga':     return s.goalsAgainst
    case 'played': return s.played
    case 'won':    return s.won
    case 'drawn':  return s.drawn
    case 'lost':   return s.lost
  }
}

const COLS: { key: SortKey; label: string; title: string }[] = [
  { key: 'played', label: 'P',   title: 'Played' },
  { key: 'won',    label: 'W',   title: 'Won' },
  { key: 'drawn',  label: 'D',   title: 'Drawn' },
  { key: 'lost',   label: 'L',   title: 'Lost' },
  { key: 'gf',     label: 'GF',  title: 'Goals For' },
  { key: 'ga',     label: 'GA',  title: 'Goals Against' },
  { key: 'gd',     label: 'GD',  title: 'Goal Difference' },
  { key: 'pts',    label: 'Pts', title: 'Points' },
]

export default function Teams() {
  const { matches, teamMap } = useData()
  const [confFilter, setConfFilter] = useState<Conf>('ALL')
  const [sortKey, setSortKey]   = useState<SortKey>('pts')
  const [sortDir, setSortDir]   = useState<SortDir>('desc')

  const allStats   = useMemo(() => computeAllStats(matches), [matches])
  const best3rdSet = useMemo(() => {
    const thirds = allStats
      .filter(s => s.groupRank === 3 && s.played > 0)
      .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor)
      .slice(0, 8)
    return new Set(thirds.map(s => s.teamId))
  }, [allStats])

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir(key === 'ga' || key === 'lost' ? 'asc' : 'desc') }
  }

  const rows = useMemo(() => {
    const mul = sortDir === 'desc' ? -1 : 1
    return [...allStats]
      .filter(s => confFilter === 'ALL' || teamMap[s.teamId]?.confederation === confFilter)
      .sort((a, b) => {
        const diff = (getVal(a, sortKey) - getVal(b, sortKey)) * mul
        if (diff !== 0) return diff
        return b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor
      })
  }, [allStats, confFilter, sortKey, sortDir, teamMap])

  const hasLive = allStats.some(s => s.isLive)
  const groupsComplete = GROUPS.filter(g => allStats.find(s => s.group === g)?.groupComplete).length

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-white">Team Rankings</h1>
        {hasLive && (
          <span className="flex items-center gap-1.5 text-green-400 text-sm font-semibold">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />LIVE
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500 mb-4">
        All 48 teams · Ranked by points → goal difference → goals scored · {groupsComplete}/12 groups complete
      </p>

      {/* Confederation filter */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {CONFS.map(c => (
          <button
            key={c}
            onClick={() => setConfFilter(c)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${confFilter === c ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          >
            {c === 'ALL' ? 'All' : c}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mb-3">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />Top 2 in group (advancing)</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />Best 3rd place (may advance)</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-600/70 shrink-0" />Eliminated</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />Playing now</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-700">
        <table className="w-full text-xs min-w-[560px]">
          <thead>
            <tr className="bg-slate-700/70 text-slate-400 border-b border-slate-600">
              <th className="text-center px-2 py-2 w-8 font-normal">#</th>
              <th className="text-left px-3 py-2 font-normal">Team</th>
              <th className="text-center px-2 py-2 font-normal text-slate-500 w-10" title="Group position">Pos</th>
              {COLS.map(col => (
                <th
                  key={col.key}
                  title={col.title}
                  onClick={() => handleSort(col.key)}
                  className={`text-center px-1.5 py-2 cursor-pointer select-none transition-colors hover:text-white whitespace-nowrap ${
                    sortKey === col.key ? 'text-white font-semibold' : 'font-normal'
                  } ${col.key === 'pts' ? 'min-w-[30px]' : ''}`}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className="ml-0.5 text-blue-400">{sortDir === 'desc' ? '↓' : '↑'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => {
              const team = teamMap[s.teamId]
              const advancing  = s.groupRank <= 2 && s.played > 0
              const maybeBest3 = s.groupRank === 3 && best3rdSet.has(s.teamId)
              const eliminated = s.groupComplete && s.groupRank === 4

              const dotColor = s.isLive
                ? 'bg-green-400 animate-pulse'
                : eliminated    ? 'bg-red-600/70'
                : advancing     ? 'bg-green-500'
                : maybeBest3    ? 'bg-amber-500'
                :                  'bg-slate-600'

              const rowBg = s.isLive ? 'bg-green-900/15' : advancing ? 'bg-green-900/5' : ''

              return (
                <tr key={s.teamId} className={`border-b border-slate-700/40 hover:bg-slate-700/20 transition-colors ${rowBg}`}>
                  {/* Rank */}
                  <td className="text-center px-2 py-2 text-slate-500 tabular-nums">{i + 1}</td>

                  {/* Team */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
                      <span className="text-base leading-none shrink-0">{team?.flagEmoji ?? '🏳'}</span>
                      <span className={`font-medium truncate ${s.isLive ? 'text-green-300' : 'text-white'}`}>
                        {team?.name ?? s.teamId}
                      </span>
                    </div>
                  </td>

                  {/* Group + position */}
                  <td className="text-center px-2 py-2 text-slate-400 font-mono text-[11px]">
                    <span
                      title={`Group ${s.group} — ${s.groupRank}${['st','nd','rd','th'][Math.min(s.groupRank-1,3)]} place`}
                      className={`inline-block px-1 rounded ${
                        advancing ? 'text-green-400' : maybeBest3 ? 'text-amber-400' : eliminated ? 'text-red-400/70' : 'text-slate-500'
                      }`}
                    >
                      {s.group}{s.groupRank}
                    </span>
                  </td>

                  {/* Stats */}
                  <td className="text-center px-1.5 py-2 text-slate-300 tabular-nums">{s.played}</td>
                  <td className="text-center px-1.5 py-2 text-slate-300 tabular-nums">{s.won}</td>
                  <td className="text-center px-1.5 py-2 text-slate-300 tabular-nums">{s.drawn}</td>
                  <td className="text-center px-1.5 py-2 text-slate-300 tabular-nums">{s.lost}</td>
                  <td className="text-center px-1.5 py-2 text-slate-300 tabular-nums">{s.goalsFor}</td>
                  <td className="text-center px-1.5 py-2 text-slate-300 tabular-nums">{s.goalsAgainst}</td>
                  <td className={`text-center px-1.5 py-2 tabular-nums font-medium ${
                    s.goalDifference > 0 ? 'text-green-400' : s.goalDifference < 0 ? 'text-red-400' : 'text-slate-400'
                  }`}>
                    {s.goalDifference > 0 ? `+${s.goalDifference}` : s.goalDifference}
                  </td>
                  <td className={`text-center px-2 py-2 font-bold tabular-nums ${s.played > 0 ? 'text-white' : 'text-slate-600'}`}>
                    {s.points}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-600 mt-2">
        Click any column header to sort · Top 2 from each group + best 8 3rd-place teams advance (32 total)
      </p>
    </div>
  )
}
