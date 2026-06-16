import { useState } from 'react'
import { useAuth } from '../components/auth/AuthProvider'
import { useData } from '../contexts/DataContext'
import { updateMatchResult, importMatchesToFirestore, importTeamsToFirestore } from '../services/firestoreMatches'
import { recalculateLeaderboard } from '../services/firestoreLeaderboard'
import type { Match } from '../types'

type Tab = 'matches' | 'import' | 'recalculate'

export default function Admin() {
  const { user, isAdmin } = useAuth()
  const [tab, setTab] = useState<Tab>('matches')

  if (!user) return <div className="p-8 text-slate-400">Sign in required.</div>
  if (!isAdmin) return <div className="p-8 text-red-400">Access denied.</div>

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-white mb-6">Admin Panel</h1>

      <div className="flex gap-2 mb-6">
        {(['matches', 'import', 'recalculate'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded text-sm font-medium capitalize ${
              tab === t ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'matches' && <MatchesTab />}
      {tab === 'import' && <ImportTab />}
      {tab === 'recalculate' && <RecalculateTab />}
    </div>
  )
}

function MatchesTab() {
  const { matches, teamMap } = useData()
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const filtered = matches.filter(m => {
    if (!search) return true
    const home = teamMap[m.homeTeamId]?.name ?? m.homeTeamId
    const away = teamMap[m.awayTeamId]?.name ?? m.awayTeamId
    return (
      home.toLowerCase().includes(search.toLowerCase()) ||
      away.toLowerCase().includes(search.toLowerCase()) ||
      m.id.includes(search)
    )
  })

  return (
    <div>
      <input
        type="text"
        placeholder="Search team or match id…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full mb-4 bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
      />

      <div className="space-y-2">
        {filtered.map(m => (
          editingId === m.id
            ? <MatchEditor key={m.id} match={m} onDone={() => setEditingId(null)} />
            : <MatchRow key={m.id} match={m} onEdit={() => setEditingId(m.id)} />
        ))}
      </div>
    </div>
  )
}

function MatchRow({ match, onEdit }: { match: Match; onEdit: () => void }) {
  const { teamMap } = useData()
  const home = teamMap[match.homeTeamId]
  const away = teamMap[match.awayTeamId]

  const statusColor: Record<string, string> = {
    FINISHED: 'text-green-400',
    LIVE: 'text-yellow-400',
    SCHEDULED: 'text-slate-400',
    POSTPONED: 'text-orange-400',
    ABANDONED: 'text-red-400',
  }

  return (
    <div className="flex items-center justify-between bg-slate-800 rounded px-4 py-2.5 gap-4">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-xs text-slate-500 w-12 shrink-0">{match.id}</span>
        <span className="text-white text-sm truncate">
          {home?.flagEmoji} {home?.shortName ?? match.homeTeamId}
          {' vs '}
          {away?.shortName ?? match.awayTeamId} {away?.flagEmoji}
        </span>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        {match.homeScore !== null ? (
          <span className="text-white font-bold text-sm">
            {match.homeScore}–{match.awayScore}
          </span>
        ) : (
          <span className="text-slate-600 text-sm">–</span>
        )}
        <span className={`text-xs font-medium ${statusColor[match.status] ?? 'text-slate-400'}`}>
          {match.status}
        </span>
        <button
          onClick={onEdit}
          className="text-xs px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded"
        >
          Edit
        </button>
      </div>
    </div>
  )
}

function MatchEditor({ match, onDone }: { match: Match; onDone: () => void }) {
  const { teamMap } = useData()
  const home = teamMap[match.homeTeamId]
  const away = teamMap[match.awayTeamId]

  const [homeScore, setHomeScore] = useState(String(match.homeScore ?? ''))
  const [awayScore, setAwayScore] = useState(String(match.awayScore ?? ''))
  const [status, setStatus] = useState<'SCHEDULED' | 'LIVE' | 'FINISHED' | 'POSTPONED'>(
    match.status === 'ABANDONED' ? 'FINISHED' : match.status
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    const h = parseInt(homeScore)
    const a = parseInt(awayScore)
    if ((status === 'FINISHED' || status === 'LIVE') && (isNaN(h) || isNaN(a))) {
      setError('Enter valid scores')
      return
    }
    setSaving(true)
    try {
      await updateMatchResult(match.id, h, a, status)
      onDone()
    } catch {
      setError('Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-slate-700 rounded px-4 py-3 border border-blue-500/50">
      <div className="text-sm text-white font-medium mb-3">
        {home?.flagEmoji} {home?.name ?? match.homeTeamId}
        {' vs '}
        {away?.name ?? match.awayTeamId} {away?.flagEmoji}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <input
            type="number" min={0} max={99}
            value={homeScore}
            onChange={e => setHomeScore(e.target.value)}
            placeholder="Home"
            className="w-16 text-center bg-slate-800 border border-slate-600 rounded text-white text-sm py-1 focus:outline-none focus:border-blue-500"
          />
          <span className="text-slate-400">–</span>
          <input
            type="number" min={0} max={99}
            value={awayScore}
            onChange={e => setAwayScore(e.target.value)}
            placeholder="Away"
            className="w-16 text-center bg-slate-800 border border-slate-600 rounded text-white text-sm py-1 focus:outline-none focus:border-blue-500"
          />
        </div>

        <select
          value={status}
          onChange={e => setStatus(e.target.value as typeof status)}
          className="bg-slate-800 border border-slate-600 rounded text-white text-sm py-1 px-2 focus:outline-none"
        >
          <option value="SCHEDULED">SCHEDULED</option>
          <option value="LIVE">LIVE</option>
          <option value="FINISHED">FINISHED</option>
          <option value="POSTPONED">POSTPONED</option>
        </select>

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white text-sm font-medium rounded"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onDone}
          className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white text-sm rounded"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
    </div>
  )
}

function ImportTab() {
  const [status, setStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const run = async (label: string, fn: () => Promise<void>) => {
    setLoading(true)
    setStatus(`Importing ${label}…`)
    try {
      await fn()
      setStatus(`✓ ${label} imported`)
    } catch (e) {
      setStatus(`✗ Failed: ${String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4 max-w-md">
      <p className="text-slate-400 text-sm">
        One-time setup — seeds Firestore from local JSON. Safe to run again (overwrites).
      </p>

      <div className="flex gap-3">
        <button
          onClick={() => run('teams', importTeamsToFirestore)}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium rounded"
        >
          Import Teams (48)
        </button>
        <button
          onClick={() => run('fixtures', importMatchesToFirestore)}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium rounded"
        >
          Import Fixtures (104)
        </button>
      </div>

      {status && (
        <p className={`text-sm ${status.startsWith('✓') ? 'text-green-400' : status.startsWith('✗') ? 'text-red-400' : 'text-slate-300'}`}>
          {status}
        </p>
      )}
    </div>
  )
}

function RecalculateTab() {
  const { matches } = useData()
  const [status, setStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleRecalculate = async () => {
    setLoading(true)
    setStatus('Recalculating…')
    try {
      const count = await recalculateLeaderboard(matches)
      setStatus(`✓ Done — scored ${count} predictions`)
    } catch (e) {
      setStatus(`✗ Failed: ${String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  const finishedCount = matches.filter(m => m.status === 'FINISHED').length

  return (
    <div className="space-y-4 max-w-md">
      <p className="text-slate-400 text-sm">
        Reads all predictions for {finishedCount} finished matches, calculates points, updates leaderboard. Safe to run multiple times.
      </p>

      <button
        onClick={handleRecalculate}
        disabled={loading || finishedCount === 0}
        className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-40 text-white text-sm font-semibold rounded"
      >
        {loading ? 'Running…' : 'Recalculate Leaderboard'}
      </button>

      {status && (
        <p className={`text-sm ${status.startsWith('✓') ? 'text-green-400' : status.startsWith('✗') ? 'text-red-400' : 'text-slate-300'}`}>
          {status}
        </p>
      )}
    </div>
  )
}
