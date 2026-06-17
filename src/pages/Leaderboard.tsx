import { useState, useEffect, useMemo } from 'react'
import { collection, getDocs, onSnapshot, orderBy, query } from 'firebase/firestore'
import { getISOWeek, parseISO } from 'date-fns'
import { db } from '../services/firebase'
import { useData } from '../contexts/DataContext'
import type { LeaderboardEntry, Match, Prediction } from '../types'

type Tab = 'overall' | 'weekly' | 'timeline'
type SortKey = 'totalPoints' | 'exactScoreCount' | 'correctOutcomeCount' | 'predictionsSubmitted'

const COLORS = ['#3b82f6', '#22c55e', '#a855f7', '#ec4899', '#f97316', '#eab308']

export default function Leaderboard() {
  const [tab, setTab] = useState<Tab>('overall')
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [entriesLoading, setEntriesLoading] = useState(true)
  const [scoredPreds, setScoredPreds] = useState<Prediction[] | null>(null)
  const { matches } = useData()

  useEffect(() => {
    const q = query(collection(db, 'leaderboard'), orderBy('totalPoints', 'desc'))
    return onSnapshot(q, snap => {
      setEntries(snap.docs.map(d => d.data() as LeaderboardEntry))
      setEntriesLoading(false)
    })
  }, [])

  useEffect(() => {
    if (tab === 'overall' || scoredPreds !== null) return
    getDocs(collection(db, 'predictions')).then(snap => {
      setScoredPreds(
        snap.docs.map(d => d.data() as Prediction).filter(p => p.pointsAwarded !== null),
      )
    })
  }, [tab, scoredPreds])

  const colorMap = useMemo(
    () => Object.fromEntries(entries.map((e, i) => [e.uid, COLORS[i % COLORS.length]])),
    [entries],
  )

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overall', label: 'Overall' },
    { key: 'weekly', label: 'Weekly' },
    { key: 'timeline', label: 'Timeline' },
  ]

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-white mb-4">Leaderboard</h1>

      <div className="flex gap-2 mb-5">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overall' && <OverallTab entries={entries} loading={entriesLoading} />}
      {tab === 'weekly' && (
        <WeeklyTab scoredPreds={scoredPreds} matches={matches} entries={entries} colorMap={colorMap} />
      )}
      {tab === 'timeline' && (
        <TimelineTab scoredPreds={scoredPreds} matches={matches} entries={entries} colorMap={colorMap} />
      )}
    </div>
  )
}

// ─── Overall ────────────────────────────────────────────────────────────────

function OverallTab({ entries, loading }: { entries: LeaderboardEntry[]; loading: boolean }) {
  const [sortKey, setSortKey] = useState<SortKey>('totalPoints')

  const sorted = [...entries].sort((a, b) => {
    const diff = b[sortKey] - a[sortKey]
    return diff !== 0 ? diff : b.totalPoints - a.totalPoints
  })

  const COLS: { key: SortKey; label: string }[] = [
    { key: 'totalPoints', label: 'Pts' },
    { key: 'exactScoreCount', label: 'Exact' },
    { key: 'correctOutcomeCount', label: 'Correct' },
    { key: 'predictionsSubmitted', label: 'Pred' },
  ]

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 rounded-lg bg-slate-800 animate-pulse" />
        ))}
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="py-16 text-center text-slate-400">
        <p>No leaderboard data yet.</p>
        <p className="text-sm mt-2">Admin needs to enter results and run recalculate.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
        <span className="text-xs text-slate-500">Live</span>
      </div>

      <div className="bg-slate-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 text-xs uppercase tracking-wider border-b border-slate-700">
              <th className="text-left px-4 py-3 w-8">#</th>
              <th className="text-left px-4 py-3">Player</th>
              {COLS.map(c => (
                <th
                  key={c.key}
                  className={`text-center px-3 py-3 cursor-pointer select-none hover:text-white transition-colors ${
                    sortKey === c.key ? 'text-blue-400' : ''
                  }`}
                  onClick={() => setSortKey(c.key)}
                >
                  {c.label}
                  {sortKey === c.key && ' ↓'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((entry, i) => (
              <tr
                key={entry.uid}
                className={`border-b border-slate-700/50 ${
                  i === 0 ? 'bg-yellow-900/10' : i === 1 ? 'bg-slate-700/20' : i === 2 ? 'bg-orange-900/10' : ''
                }`}
              >
                <td className="px-4 py-3 text-slate-400 font-medium">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {entry.photoURL ? (
                      <img src={entry.photoURL} alt="" className="w-7 h-7 rounded-full" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center text-xs text-white">
                        {entry.displayName?.[0]}
                      </div>
                    )}
                    <span className="text-white font-medium">{entry.displayName}</span>
                  </div>
                </td>
                <td className="text-center px-3 py-3 font-bold text-yellow-400">{entry.totalPoints}</td>
                <td className="text-center px-3 py-3 text-green-400">{entry.exactScoreCount}</td>
                <td className="text-center px-3 py-3 text-blue-400">{entry.correctOutcomeCount}</td>
                <td className="text-center px-3 py-3 text-slate-300">{entry.predictionsSubmitted}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500 mt-3 text-center">Click column headers to sort</p>
    </div>
  )
}

// ─── Weekly ─────────────────────────────────────────────────────────────────

function WeeklyTab({
  scoredPreds,
  matches,
  entries,
  colorMap,
}: {
  scoredPreds: Prediction[] | null
  matches: Match[]
  entries: LeaderboardEntry[]
  colorMap: Record<string, string>
}) {
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null)

  const matchWeekMap = useMemo(() => {
    const m: Record<string, number> = {}
    for (const match of matches) m[match.id] = getISOWeek(parseISO(match.scheduledKickoffUtc))
    return m
  }, [matches])

  const scoredWeeks = useMemo(() => {
    if (!scoredPreds) return []
    const s = new Set<number>()
    for (const p of scoredPreds) {
      const w = matchWeekMap[p.matchId]
      if (w) s.add(w)
    }
    return [...s].sort()
  }, [scoredPreds, matchWeekMap])

  useEffect(() => {
    if (!scoredWeeks.length || selectedWeek !== null) return
    const cur = getISOWeek(new Date())
    setSelectedWeek(scoredWeeks.includes(cur) ? cur : scoredWeeks[scoredWeeks.length - 1])
  }, [scoredWeeks, selectedWeek])

  const weeklyRows = useMemo(() => {
    if (!scoredPreds || selectedWeek === null) return []
    const pts: Record<string, number> = {}
    for (const p of scoredPreds) {
      if (matchWeekMap[p.matchId] !== selectedWeek) continue
      pts[p.userId] = (pts[p.userId] ?? 0) + (p.pointsAwarded ?? 0)
    }
    return [...entries]
      .map(e => ({ ...e, weekPts: pts[e.uid] ?? 0 }))
      .sort((a, b) => b.weekPts - a.weekPts || b.totalPoints - a.totalPoints)
  }, [scoredPreds, selectedWeek, matchWeekMap, entries])

  const minWeek = scoredWeeks[0] ?? getISOWeek(new Date())
  const weekLabel = (w: number) => `Week ${w - minWeek + 1}`

  if (!scoredPreds) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 rounded-lg bg-slate-800 animate-pulse" />
        ))}
      </div>
    )
  }

  if (!scoredWeeks.length) {
    return (
      <div className="py-16 text-center text-slate-400">No scored matches yet.</div>
    )
  }

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {scoredWeeks.map(w => (
          <button
            key={w}
            onClick={() => setSelectedWeek(w)}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              selectedWeek === w
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {weekLabel(w)}
          </button>
        ))}
      </div>

      <div className="bg-slate-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 text-xs uppercase tracking-wider border-b border-slate-700">
              <th className="text-left px-4 py-3 w-8">#</th>
              <th className="text-left px-4 py-3">Player</th>
              <th className="text-center px-4 py-3">Week pts</th>
              <th className="text-center px-4 py-3 text-slate-600">Total</th>
            </tr>
          </thead>
          <tbody>
            {weeklyRows.map((entry, i) => (
              <tr key={entry.uid} className="border-b border-slate-700/50">
                <td className="px-4 py-3 text-slate-400 font-medium">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: colorMap[entry.uid] }}
                    />
                    {entry.photoURL ? (
                      <img src={entry.photoURL} alt="" className="w-7 h-7 rounded-full" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center text-xs text-white">
                        {entry.displayName?.[0]}
                      </div>
                    )}
                    <span className="text-white font-medium">{entry.displayName}</span>
                  </div>
                </td>
                <td className="text-center px-4 py-3 font-bold text-yellow-400">{entry.weekPts}</td>
                <td className="text-center px-4 py-3 text-slate-500">{entry.totalPoints}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Timeline ───────────────────────────────────────────────────────────────

function TimelineTab({
  scoredPreds,
  matches,
  entries,
  colorMap,
}: {
  scoredPreds: Prediction[] | null
  matches: Match[]
  entries: LeaderboardEntry[]
  colorMap: Record<string, string>
}) {
  const matchMap = useMemo(
    () => Object.fromEntries(matches.map(m => [m.id, m])),
    [matches],
  )

  const { gameDates, cumulByUser } = useMemo(() => {
    if (!scoredPreds || !entries.length) return { gameDates: [], cumulByUser: {} }

    const byUserDate: Record<string, Record<string, number>> = {}
    const dateSet = new Set<string>()

    for (const p of scoredPreds) {
      const match = matchMap[p.matchId]
      if (!match) continue
      const d = match.scheduledKickoffUtc.slice(0, 10)
      dateSet.add(d)
      if (!byUserDate[p.userId]) byUserDate[p.userId] = {}
      byUserDate[p.userId][d] = (byUserDate[p.userId][d] ?? 0) + (p.pointsAwarded ?? 0)
    }

    const gameDates = [...dateSet].sort()

    const cumulByUser: Record<string, number[]> = {}
    for (const e of entries) {
      let sum = 0
      cumulByUser[e.uid] = gameDates.map(d => {
        sum += byUserDate[e.uid]?.[d] ?? 0
        return sum
      })
    }

    return { gameDates, cumulByUser }
  }, [scoredPreds, matchMap, entries])

  if (!scoredPreds) {
    return <div className="h-52 bg-slate-800 rounded-lg animate-pulse" />
  }

  if (!gameDates.length) {
    return (
      <div className="py-16 text-center text-slate-400">No scored matches yet.</div>
    )
  }

  // SVG layout
  const VW = 560, VH = 210
  const PAD = { l: 32, r: 8, t: 16, b: 30 }
  const IW = VW - PAD.l - PAD.r
  const IH = VH - PAD.t - PAD.b

  const maxPts = Math.max(...Object.values(cumulByUser).flatMap(a => a), 1)
  const n = gameDates.length

  const xOf = (i: number) => PAD.l + (n <= 1 ? IW / 2 : (i / (n - 1)) * IW)
  const yOf = (pts: number) => PAD.t + IH - (pts / maxPts) * IH

  const yTicks = [0, Math.round(maxPts / 2), maxPts]
  const xStep = Math.max(1, Math.ceil(n / 6))

  const fmtDate = (d: string) =>
    new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

  const ranked = [...entries].sort(
    (a, b) => (cumulByUser[b.uid]?.at(-1) ?? 0) - (cumulByUser[a.uid]?.at(-1) ?? 0),
  )

  return (
    <div>
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        className="w-full rounded-lg bg-slate-800/60"
        style={{ height: VH }}
      >
        {/* Horizontal grid + y labels */}
        {yTicks.map(tick => (
          <g key={tick}>
            <line
              x1={PAD.l} y1={yOf(tick)} x2={PAD.l + IW} y2={yOf(tick)}
              stroke="#1e293b" strokeWidth="1"
            />
            <text x={PAD.l - 4} y={yOf(tick)} textAnchor="end" dominantBaseline="middle"
              fill="#475569" fontSize="10">
              {tick}
            </text>
          </g>
        ))}

        {/* X-axis date labels */}
        {gameDates.map((d, i) =>
          i % xStep === 0 ? (
            <text key={d} x={xOf(i)} y={PAD.t + IH + 14} textAnchor="middle"
              fill="#475569" fontSize="10">
              {fmtDate(d)}
            </text>
          ) : null,
        )}

        {/* Lines + dots per player */}
        {entries.map(entry => {
          const pts = cumulByUser[entry.uid]
          if (!pts?.length) return null
          const color = colorMap[entry.uid] ?? '#94a3b8'
          const pointsStr = pts.map((p, i) => `${xOf(i)},${yOf(p)}`).join(' ')

          return (
            <g key={entry.uid}>
              <polyline
                points={pointsStr}
                fill="none" stroke={color} strokeWidth="2.5"
                strokeLinejoin="round" strokeLinecap="round"
              />
              {pts.map((p, i) => (
                <circle key={i} cx={xOf(i)} cy={yOf(p)} r="3.5" fill={color} />
              ))}
            </g>
          )
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4 justify-center">
        {ranked.map(entry => (
          <div key={entry.uid} className="flex items-center gap-1.5 text-sm">
            <div className="w-3 h-0.5 rounded" style={{ background: colorMap[entry.uid] }} />
            <div
              className="w-2 h-2 rounded-full"
              style={{ background: colorMap[entry.uid] }}
            />
            <span className="text-slate-300">{entry.displayName?.split(' ')[0]}</span>
            <span className="text-slate-500 text-xs">
              {cumulByUser[entry.uid]?.at(-1) ?? 0} pts
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
