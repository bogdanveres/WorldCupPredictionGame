import { useState, useEffect } from 'react'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '../services/firebase'
import type { LeaderboardEntry } from '../types'

type SortKey = 'totalPoints' | 'exactScoreCount' | 'correctOutcomeCount' | 'predictionsSubmitted'

export default function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('totalPoints')

  useEffect(() => {
    getDocs(query(collection(db, 'leaderboard'), orderBy('totalPoints', 'desc')))
      .then(snap => setEntries(snap.docs.map(d => d.data() as LeaderboardEntry)))
      .finally(() => setLoading(false))
  }, [])

  const sorted = [...entries].sort((a, b) => {
    const diff = b[sortKey] - a[sortKey]
    if (diff !== 0) return diff
    return b.totalPoints - a.totalPoints
  })

  const COLS: { key: SortKey; label: string }[] = [
    { key: 'totalPoints', label: 'Pts' },
    { key: 'exactScoreCount', label: 'Exact' },
    { key: 'correctOutcomeCount', label: 'Correct' },
    { key: 'predictionsSubmitted', label: 'Pred' },
  ]

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 rounded-lg bg-slate-800 animate-pulse" />
        ))}
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center text-slate-400">
        <p>No leaderboard data yet.</p>
        <p className="text-sm mt-2">Admin needs to enter results and run recalculate.</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-white mb-4">Leaderboard</h1>

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
