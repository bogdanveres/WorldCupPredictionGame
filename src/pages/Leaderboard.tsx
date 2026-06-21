import { useState, useEffect, useMemo } from 'react'
import { collection, getDocs, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { getISOWeek, parseISO } from 'date-fns'
import { db } from '../services/firebase'
import { useData } from '../contexts/DataContext'
import { todayRomaniaGameDateStr, romaniaGameDateStr } from '../utils/timezone'
import type { LeaderboardEntry, Match, Prediction, Team } from '../types'

type Tab = 'overall' | 'weekly' | 'timeline' | 'compare'
type SortKey = 'totalPoints' | 'exactScoreCount' | 'correctOutcomeCount' | 'predictionsSubmitted'

const COLORS = ['#3b82f6', '#22c55e', '#a855f7', '#ec4899', '#f97316', '#eab308']

export default function Leaderboard() {
  const [tab, setTab] = useState<Tab>('overall')
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [entriesLoading, setEntriesLoading] = useState(true)
  const [scoredPreds, setScoredPreds] = useState<Prediction[] | null>(null)
  const [selectedUser, setSelectedUser] = useState<LeaderboardEntry | null>(null)
  const { matches, teamMap } = useData()

  useEffect(() => {
    const q = query(collection(db, 'leaderboard'), orderBy('totalPoints', 'desc'))
    return onSnapshot(q, snap => {
      setEntries(snap.docs.map(d => d.data() as LeaderboardEntry))
      setEntriesLoading(false)
    })
  }, [])

  // Load all scored predictions eagerly (needed for streaks on Overall tab too)
  useEffect(() => {
    if (scoredPreds !== null) return
    getDocs(collection(db, 'predictions')).then(snap => {
      setScoredPreds(
        snap.docs.map(d => d.data() as Prediction).filter(p => p.pointsAwarded !== null),
      )
    })
  }, [scoredPreds])

  const colorMap = useMemo(
    () => Object.fromEntries(entries.map((e, i) => [e.uid, COLORS[i % COLORS.length]])),
    [entries],
  )

  // Streak per user: consecutive correct predictions from most recent backwards
  const streakMap = useMemo<Record<string, number>>(() => {
    if (!scoredPreds || !matches.length) return {}
    const matchDate = Object.fromEntries(matches.map(m => [m.id, m.scheduledKickoffUtc]))
    const byUser: Record<string, { pts: number; date: string }[]> = {}
    for (const p of scoredPreds) {
      const date = matchDate[p.matchId]
      if (!date) continue
      if (!byUser[p.userId]) byUser[p.userId] = []
      byUser[p.userId].push({ pts: p.pointsAwarded ?? 0, date })
    }
    const result: Record<string, number> = {}
    for (const [uid, items] of Object.entries(byUser)) {
      const sorted = [...items].sort((a, b) => b.date.localeCompare(a.date))
      let s = 0
      for (const item of sorted) { if (item.pts > 0) s++; else break }
      result[uid] = s
    }
    return result
  }, [scoredPreds, matches])

  // Today's points per user (Romania game-day)
  const todayPtsMap = useMemo<Record<string, number>>(() => {
    if (!scoredPreds || !matches.length) return {}
    const todayStr = todayRomaniaGameDateStr()
    const todayMatchIds = new Set(
      matches
        .filter(m => (m.status === 'FINISHED' || m.status === 'LIVE') && romaniaGameDateStr(m.scheduledKickoffUtc) === todayStr)
        .map(m => m.id)
    )
    if (todayMatchIds.size === 0) return {}
    const result: Record<string, number> = {}
    for (const p of scoredPreds) {
      if (!todayMatchIds.has(p.matchId)) continue
      result[p.userId] = (result[p.userId] ?? 0) + (p.pointsAwarded ?? 0)
    }
    return result
  }, [scoredPreds, matches])

  // Biggest mover: user with the largest positive rank change
  const biggestMoverUid = useMemo(() => {
    let best: { uid: string; gain: number } | null = null
    for (const e of entries) {
      if (e.previousRank != null && e.rank < e.previousRank) {
        const gain = e.previousRank - e.rank
        if (!best || gain > best.gain) best = { uid: e.uid, gain }
      }
    }
    return best && best.gain >= 1 ? best.uid : null
  }, [entries])

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overall', label: 'Overall' },
    { key: 'weekly', label: 'Weekly' },
    { key: 'timeline', label: 'Timeline' },
    { key: 'compare', label: 'Compare' },
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

      {tab === 'overall' && (
        <OverallTab
          entries={entries}
          loading={entriesLoading}
          hasLive={matches.some(m => m.status === 'LIVE')}
          streakMap={streakMap}
          biggestMoverUid={biggestMoverUid}
          todayPtsMap={todayPtsMap}
          onSelect={setSelectedUser}
        />
      )}

      {selectedUser && (
        <UserPredictionsModal
          user={selectedUser}
          matches={matches}
          teamMap={teamMap}
          onClose={() => setSelectedUser(null)}
        />
      )}
      {tab === 'weekly' && (
        <WeeklyTab scoredPreds={scoredPreds} matches={matches} entries={entries} colorMap={colorMap} />
      )}
      {tab === 'timeline' && (
        <TimelineTab scoredPreds={scoredPreds} matches={matches} entries={entries} colorMap={colorMap} />
      )}
      {tab === 'compare' && (
        <CompareTab scoredPreds={scoredPreds} matches={matches} entries={entries} teamMap={teamMap} />
      )}
    </div>
  )
}

// ─── Overall ────────────────────────────────────────────────────────────────

function OverallTab({
  entries,
  loading,
  hasLive,
  streakMap,
  biggestMoverUid,
  todayPtsMap,
  onSelect,
}: {
  entries: LeaderboardEntry[]
  loading: boolean
  hasLive: boolean
  streakMap: Record<string, number>
  biggestMoverUid: string | null
  todayPtsMap: Record<string, number>
  onSelect: (entry: LeaderboardEntry) => void
}) {
  const [sortKey, setSortKey] = useState<SortKey>('totalPoints')
  const showToday = Object.keys(todayPtsMap).length > 0

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
        <span className="text-xs text-slate-500">
          {hasLive ? 'Live · includes in-progress match scores' : 'Live'}
        </span>
      </div>

      <div className="bg-slate-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 text-xs uppercase tracking-wider border-b border-slate-700">
              <th className="text-left px-4 py-3 w-8">#</th>
              <th className="text-left px-4 py-3">Player</th>
              {showToday && (
                <th className="text-center px-2 py-3 text-amber-400 whitespace-nowrap">Today</th>
              )}
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
                onClick={() => onSelect(entry)}
                className={`border-b border-slate-700/50 cursor-pointer hover:bg-slate-700/40 transition-colors ${
                  i === 0 ? 'bg-yellow-900/10' : i === 1 ? 'bg-slate-700/20' : i === 2 ? 'bg-orange-900/10' : ''
                }`}
              >
                <td className="px-3 py-3 text-slate-400 font-medium">
                  <div className="flex flex-col items-center gap-0.5">
                    <span>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
                    {entry.previousRank != null && entry.previousRank !== entry.rank && (
                      <span className={`text-[10px] font-bold leading-none ${entry.rank < entry.previousRank ? 'text-green-400' : 'text-red-400'}`}>
                        {entry.rank < entry.previousRank ? `▲${entry.previousRank - entry.rank}` : `▼${entry.rank - entry.previousRank}`}
                      </span>
                    )}
                  </div>
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
                    {biggestMoverUid === entry.uid && <span title="Biggest mover">🚀</span>}
                    {(streakMap[entry.uid] ?? 0) >= 3 && (
                      <span className="text-orange-400 text-xs font-bold">🔥{streakMap[entry.uid]}</span>
                    )}
                  </div>
                </td>
                {showToday && (
                  <td className="text-center px-2 py-3 font-semibold text-amber-400">
                    {todayPtsMap[entry.uid] != null ? `+${todayPtsMap[entry.uid]}` : '—'}
                  </td>
                )}
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

  const last = (uid: string) => {
    const a = cumulByUser[uid]
    return a ? a[a.length - 1] ?? 0 : 0
  }
  const ranked = [...entries].sort((a, b) => last(b.uid) - last(a.uid))

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
              {last(entry.uid) ?? 0} pts
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── User Predictions Modal ──────────────────────────────────────────────────

const ROUND_LABEL: Record<string, string> = {
  GROUP: 'Group Stage', ROUND_OF_32: 'Round of 32', ROUND_OF_16: 'Round of 16',
  QUARTER_FINAL: 'Quarter-finals', SEMI_FINAL: 'Semi-finals',
  THIRD_PLACE: '3rd Place', FINAL: 'Final',
}

function ptsBadge(pts: number | null) {
  if (pts === 5 || pts === 2) return { label: `${pts}pts`, cls: 'text-green-300 bg-green-900/50' }
  if (pts === 3)              return { label: '3pts',      cls: 'text-blue-300 bg-blue-900/50' }
  if (pts === 1)              return { label: '1pt',       cls: 'text-sky-300 bg-sky-900/50' }
  if (pts === 0)              return { label: '0pts',      cls: 'text-slate-500 bg-slate-700/50' }
  return null
}

function UserPredictionsModal({
  user,
  matches,
  teamMap,
  onClose,
}: {
  user: LeaderboardEntry
  matches: Match[]
  teamMap: Record<string, Team>
  onClose: () => void
}) {
  const [preds, setPreds] = useState<Prediction[] | null>(null)
  const [tab, setTab] = useState<'predictions' | 'stats'>('predictions')

  useEffect(() => {
    getDocs(query(collection(db, 'predictions'), where('userId', '==', user.uid))).then(snap => {
      setPreds(snap.docs.map(d => d.data() as Prediction))
    })
  }, [user.uid])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const rows = useMemo(() => {
    if (!preds) return []
    const matchMap = Object.fromEntries(matches.map(m => [m.id, m]))
    return preds
      .map(p => ({ pred: p, match: matchMap[p.matchId] }))
      .filter(r => r.match?.status === 'FINISHED')
      .sort((a, b) => a.match.scheduledKickoffUtc.localeCompare(b.match.scheduledKickoffUtc))
  }, [preds, matches])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative bg-slate-900 rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-lg max-h-[90vh] sm:max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-slate-700 shrink-0">
          {user.photoURL ? (
            <img src={user.photoURL} alt="" className="w-10 h-10 rounded-full shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center text-white font-semibold shrink-0">
              {user.displayName?.[0]}
            </div>
          )}
          <div className="min-w-0">
            <div className="text-white font-bold truncate">{user.displayName}</div>
            <div className="text-slate-400 text-xs">
              {user.totalPoints} pts · {user.exactScoreCount} exact · {user.correctOutcomeCount} correct
            </div>
          </div>
          <button onClick={onClose} className="ml-auto shrink-0 text-slate-400 hover:text-white transition-colors p-1 touch-manipulation" aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 py-2 border-b border-slate-700 shrink-0">
          {(['predictions', 'stats'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors capitalize ${tab === t ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              {t === 'predictions' ? 'Predictions' : 'Stats'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          {preds === null ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 rounded-lg bg-slate-800 animate-pulse" />)}
            </div>
          ) : tab === 'predictions' ? (
            rows.length === 0 ? (
              <div className="py-14 text-center text-slate-400 text-sm">No predictions for finished matches yet.</div>
            ) : (
              <div className="divide-y divide-slate-700/40">
                {rows.map(({ pred, match }) => {
                  const home  = teamMap[match.homeTeamId]
                  const away  = teamMap[match.awayTeamId]
                  const badge = ptsBadge(pred.pointsAwarded)
                  const label = match.group ? `Group ${match.group}` : ROUND_LABEL[match.round] ?? match.round
                  const exact = pred.predictedHomeScore === match.homeScore && pred.predictedAwayScore === match.awayScore
                  return (
                    <div key={pred.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-sm font-medium text-white">
                          <span className="text-base leading-none">{home?.flagEmoji ?? '🏳'}</span>
                          <span className="truncate max-w-[4rem]">{home?.shortName ?? match.homeTeamId}</span>
                          <span className="text-slate-300 font-bold tabular-nums">{match.homeScore}–{match.awayScore}</span>
                          <span className="truncate max-w-[4rem]">{away?.shortName ?? match.awayTeamId}</span>
                          <span className="text-base leading-none">{away?.flagEmoji ?? '🏳'}</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1 flex-wrap">
                          <span>{label}</span><span>·</span>
                          <span>Pred: <span className="text-slate-300 tabular-nums">{pred.predictedHomeScore}–{pred.predictedAwayScore}</span></span>
                          {exact && <span className="text-green-400 font-medium">✓ exact</span>}
                        </div>
                      </div>
                      {badge && <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>}
                    </div>
                  )
                })}
              </div>
            )
          ) : (
            <UserStatsTab rows={rows} teamMap={teamMap} />
          )}
        </div>

        {preds !== null && rows.length > 0 && tab === 'predictions' && (
          <div className="shrink-0 border-t border-slate-700 px-4 py-2.5 text-xs text-slate-500 text-center">
            {rows.length} prediction{rows.length !== 1 ? 's' : ''} · tap outside to close
          </div>
        )}
      </div>
    </div>
  )
}

function UserStatsTab({ rows, teamMap }: { rows: { pred: Prediction; match: Match }[]; teamMap: Record<string, Team> }) {
  if (rows.length === 0) {
    return <div className="py-14 text-center text-slate-400 text-sm">No finished match data yet.</div>
  }

  const total   = rows.length
  const correct = rows.filter(r => (r.pred.pointsAwarded ?? 0) > 0).length
  const exact   = rows.filter(r => r.pred.pointsAwarded === 5 || r.pred.pointsAwarded === 2).length
  const totalPts = rows.reduce((s, r) => s + (r.pred.pointsAwarded ?? 0), 0)
  const avgPts  = (totalPts / total).toFixed(1)

  // Current streak (from most recent backwards)
  const sorted = [...rows].sort((a, b) => b.match.scheduledKickoffUtc.localeCompare(a.match.scheduledKickoffUtc))
  let streak = 0
  for (const r of sorted) {
    if ((r.pred.pointsAwarded ?? 0) > 0) streak++
    else break
  }

  // Best prediction
  const best = rows.reduce((b, r) => (r.pred.pointsAwarded ?? 0) > (b.pred.pointsAwarded ?? 0) ? r : b, rows[0])

  // By round
  const byRound: Record<string, { correct: number; exact: number; total: number; pts: number }> = {}
  for (const r of rows) {
    const key = r.match.round
    if (!byRound[key]) byRound[key] = { correct: 0, exact: 0, total: 0, pts: 0 }
    byRound[key].total++
    byRound[key].pts += r.pred.pointsAwarded ?? 0
    if ((r.pred.pointsAwarded ?? 0) > 0) byRound[key].correct++
    if (r.pred.pointsAwarded === 5 || r.pred.pointsAwarded === 2) byRound[key].exact++
  }

  const roundOrder = ['GROUP','ROUND_OF_32','ROUND_OF_16','QUARTER_FINAL','SEMI_FINAL','THIRD_PLACE','FINAL']
  const rounds = roundOrder.filter(r => byRound[r])

  const bestHome = teamMap[best.match.homeTeamId]
  const bestAway = teamMap[best.match.awayTeamId]

  return (
    <div className="p-4 space-y-5">
      {/* Top stats */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Correct', value: `${Math.round(correct/total*100)}%`, sub: `${correct}/${total}` },
          { label: 'Exact',   value: `${Math.round(exact/total*100)}%`,   sub: `${exact}/${total}` },
          { label: 'Avg pts', value: avgPts,  sub: 'per game' },
          { label: 'Streak',  value: streak > 0 ? `${streak}` : '0', sub: streak >= 3 ? '🔥' : 'correct' },
        ].map(s => (
          <div key={s.label} className="bg-slate-800 rounded-lg p-2.5 text-center">
            <div className="text-lg font-bold text-white">{s.value}</div>
            <div className="text-xs text-slate-400">{s.label}</div>
            <div className="text-xs text-slate-600">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Best prediction */}
      {(best.pred.pointsAwarded === 5 || best.pred.pointsAwarded === 2) && (
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1.5">Best prediction</div>
          <div className="bg-green-900/20 border border-green-800/40 rounded-lg px-3 py-2.5 flex items-center gap-2">
            <span className="text-lg">{bestHome?.flagEmoji}</span>
            <span className="text-white font-medium text-sm">{bestHome?.shortName}</span>
            <span className="text-green-400 font-bold tabular-nums">{best.pred.predictedHomeScore}–{best.pred.predictedAwayScore}</span>
            <span className="text-white font-medium text-sm">{bestAway?.shortName}</span>
            <span className="text-lg">{bestAway?.flagEmoji}</span>
            <span className="ml-auto text-green-300 text-xs font-bold bg-green-900/50 px-2 py-0.5 rounded-full">{best.pred.pointsAwarded}pts exact</span>
          </div>
        </div>
      )}

      {/* By round */}
      {rounds.length > 0 && (
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1.5">By round</div>
          <div className="bg-slate-800 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-700">
                  <th className="text-left px-3 py-2">Round</th>
                  <th className="text-center px-2 py-2">Games</th>
                  <th className="text-center px-2 py-2">Correct</th>
                  <th className="text-center px-2 py-2">Exact</th>
                  <th className="text-center px-2 py-2 text-slate-300">Pts</th>
                </tr>
              </thead>
              <tbody>
                {rounds.map(r => {
                  const s = byRound[r]
                  return (
                    <tr key={r} className="border-b border-slate-700/50">
                      <td className="px-3 py-2 text-slate-300">{ROUND_LABEL[r] ?? r}</td>
                      <td className="text-center px-2 py-2 text-slate-400">{s.total}</td>
                      <td className="text-center px-2 py-2 text-blue-400">{s.correct}</td>
                      <td className="text-center px-2 py-2 text-green-400">{s.exact}</td>
                      <td className="text-center px-2 py-2 font-bold text-white">{s.pts}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Head-to-Head Compare ────────────────────────────────────────────────────

function CompareTab({
  scoredPreds,
  matches,
  entries,
  teamMap,
}: {
  scoredPreds: Prediction[] | null
  matches: Match[]
  entries: LeaderboardEntry[]
  teamMap: Record<string, Team>
}) {
  const [uidA, setUidA] = useState('')
  const [uidB, setUidB] = useState('')

  const finishedMatches = useMemo(
    () =>
      [...matches]
        .filter(m => m.status === 'FINISHED')
        .sort((a, b) => a.scheduledKickoffUtc.localeCompare(b.scheduledKickoffUtc)),
    [matches],
  )

  // uid → matchId → prediction
  const predIndex = useMemo<Record<string, Record<string, Prediction>>>(() => {
    if (!scoredPreds) return {}
    const idx: Record<string, Record<string, Prediction>> = {}
    for (const p of scoredPreds) {
      if (!idx[p.userId]) idx[p.userId] = {}
      idx[p.userId][p.matchId] = p
    }
    return idx
  }, [scoredPreds])

  const rows = useMemo(() => {
    if (!uidA || !uidB) return []
    return finishedMatches
      .map(m => ({ match: m, predA: predIndex[uidA]?.[m.id] ?? null, predB: predIndex[uidB]?.[m.id] ?? null }))
      .filter(r => r.predA || r.predB)
  }, [uidA, uidB, finishedMatches, predIndex])

  const totals = useMemo(() => {
    const t = { ptsA: 0, ptsB: 0, exactA: 0, exactB: 0, correctA: 0, correctB: 0 }
    for (const { predA, predB } of rows) {
      t.ptsA += predA?.pointsAwarded ?? 0
      t.ptsB += predB?.pointsAwarded ?? 0
      if (predA?.pointsAwarded === 5 || predA?.pointsAwarded === 2) t.exactA++
      if (predB?.pointsAwarded === 5 || predB?.pointsAwarded === 2) t.exactB++
      if ((predA?.pointsAwarded ?? 0) > 0) t.correctA++
      if ((predB?.pointsAwarded ?? 0) > 0) t.correctB++
    }
    return t
  }, [rows])

  const entryA = entries.find(e => e.uid === uidA)
  const entryB = entries.find(e => e.uid === uidB)

  if (!scoredPreds) {
    return <div className="h-52 bg-slate-800 rounded-lg animate-pulse" />
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {([['Player A', uidA, setUidA, uidB], ['Player B', uidB, setUidB, uidA]] as const).map(
          ([label, val, set, other]) => (
            <div key={label}>
              <label className="text-xs text-slate-500 uppercase tracking-wider mb-1 block">{label}</label>
              <select
                value={val}
                onChange={e => (set as (v: string) => void)(e.target.value)}
                className="w-full bg-slate-800 text-white rounded-lg px-3 py-2 text-sm border border-slate-700 focus:outline-none focus:border-blue-500"
              >
                <option value="">Select player…</option>
                {entries.filter(e => e.uid !== other).map(e => (
                  <option key={e.uid} value={e.uid}>{e.displayName}</option>
                ))}
              </select>
            </div>
          ),
        )}
      </div>

      {(!uidA || !uidB) ? (
        <div className="py-16 text-center text-slate-400 text-sm">Select two players to compare their predictions.</div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center text-slate-400 text-sm">No finished match predictions to compare yet.</div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-800 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-blue-400">{totals.ptsA}</div>
              <div className="text-sm text-slate-300 font-medium truncate">{entryA?.displayName?.split(' ')[0]}</div>
              <div className="text-xs text-slate-600 mt-0.5">{totals.exactA} exact · {totals.correctA} correct</div>
            </div>
            <div className="bg-slate-800 rounded-lg p-3 flex flex-col items-center justify-center">
              <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">pts</div>
              <div className="text-slate-400 text-xs mt-0.5">head-to-head</div>
              {totals.ptsA !== totals.ptsB && (
                <div className="text-xs font-bold mt-1 text-slate-300">
                  {totals.ptsA > totals.ptsB ? `+${totals.ptsA - totals.ptsB}` : `+${totals.ptsB - totals.ptsA}`}
                </div>
              )}
            </div>
            <div className="bg-slate-800 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-purple-400">{totals.ptsB}</div>
              <div className="text-sm text-slate-300 font-medium truncate">{entryB?.displayName?.split(' ')[0]}</div>
              <div className="text-xs text-slate-600 mt-0.5">{totals.exactB} exact · {totals.correctB} correct</div>
            </div>
          </div>

          {/* Match-by-match */}
          <div className="bg-slate-800 rounded-lg overflow-hidden">
            <div className="grid text-xs text-slate-500 uppercase tracking-wider border-b border-slate-700 px-3 py-2"
                 style={{ gridTemplateColumns: '1fr auto 1fr' }}>
              <span className="text-blue-400 truncate">{entryA?.displayName?.split(' ')[0]}</span>
              <span className="text-center px-4">Match</span>
              <span className="text-purple-400 text-right truncate">{entryB?.displayName?.split(' ')[0]}</span>
            </div>

            <div className="divide-y divide-slate-700/40">
              {rows.map(({ match, predA, predB }) => {
                const home = teamMap[match.homeTeamId]
                const away = teamMap[match.awayTeamId]
                const badgeA = ptsBadge(predA?.pointsAwarded ?? null)
                const badgeB = ptsBadge(predB?.pointsAwarded ?? null)
                return (
                  <div key={match.id} className="grid items-center px-3 py-2.5 gap-2"
                       style={{ gridTemplateColumns: '1fr auto 1fr' }}>
                    <div className="flex items-center gap-1.5">
                      {badgeA && (
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full shrink-0 ${badgeA.cls}`}>{badgeA.label}</span>
                      )}
                      {predA ? (
                        <span className="text-sm text-white tabular-nums font-mono">{predA.predictedHomeScore}–{predA.predictedAwayScore}</span>
                      ) : (
                        <span className="text-slate-600 text-xs">—</span>
                      )}
                    </div>

                    <div className="text-center px-1">
                      <div className="flex items-center justify-center gap-1 text-xs whitespace-nowrap">
                        <span>{home?.flagEmoji ?? '🏳'}</span>
                        <span className="text-slate-300 tabular-nums font-bold">{match.homeScore}–{match.awayScore}</span>
                        <span>{away?.flagEmoji ?? '🏳'}</span>
                      </div>
                      <div className="text-[10px] text-slate-600 mt-0.5 whitespace-nowrap">
                        {home?.shortName} vs {away?.shortName}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-1.5">
                      {predB ? (
                        <span className="text-sm text-white tabular-nums font-mono">{predB.predictedHomeScore}–{predB.predictedAwayScore}</span>
                      ) : (
                        <span className="text-slate-600 text-xs">—</span>
                      )}
                      {badgeB && (
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full shrink-0 ${badgeB.cls}`}>{badgeB.label}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Totals row */}
            <div className="grid items-center px-3 py-2.5 border-t border-slate-600 bg-slate-700/30"
                 style={{ gridTemplateColumns: '1fr auto 1fr' }}>
              <span className={`text-base font-bold ${
                totals.ptsA > totals.ptsB ? 'text-blue-400' : totals.ptsA === totals.ptsB ? 'text-slate-300' : 'text-slate-500'
              }`}>{totals.ptsA} pts</span>
              <span className="text-xs text-slate-500 uppercase tracking-wider text-center px-2">Total</span>
              <span className={`text-base font-bold text-right ${
                totals.ptsB > totals.ptsA ? 'text-purple-400' : totals.ptsB === totals.ptsA ? 'text-slate-300' : 'text-slate-500'
              }`}>{totals.ptsB} pts</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
