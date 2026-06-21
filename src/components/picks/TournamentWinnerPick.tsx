import { useState, useEffect, useMemo } from 'react'
import { collection, doc, setDoc, onSnapshot } from 'firebase/firestore'
import { db } from '../../services/firebase'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../../contexts/DataContext'
import type { Team } from '../../types'

const BONUS_PTS = 10

interface TournamentPick {
  userId: string
  teamId: string
  submittedAt: string
  bonusPoints?: number
}

export default function TournamentWinnerPick() {
  const { user } = useAuth()
  const { matches, teamMap } = useData()
  const [myPick, setMyPick] = useState<TournamentPick | null | undefined>(undefined)
  const [allPicks, setAllPicks] = useState<TournamentPick[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Load own pick
  useEffect(() => {
    if (!user) { setMyPick(null); return }
    const ref = doc(db, 'picks', user.uid)
    return onSnapshot(ref, snap => {
      setMyPick(snap.exists() ? (snap.data() as TournamentPick) : null)
    })
  }, [user?.uid])

  // Load all picks to show community pick counts
  useEffect(() => {
    return onSnapshot(collection(db, 'picks'), snap => {
      setAllPicks(snap.docs.map(d => d.data() as TournamentPick))
    })
  }, [])

  // First knockout match kickoff = lock date
  const lockDate = useMemo(() => {
    const knockoutMatches = matches.filter(m => m.round !== 'GROUP')
    if (!knockoutMatches.length) return null
    const earliest = knockoutMatches.reduce((a, b) =>
      a.scheduledKickoffUtc < b.scheduledKickoffUtc ? a : b
    )
    return new Date(earliest.scheduledKickoffUtc)
  }, [matches])

  const isLocked = lockDate ? Date.now() >= lockDate.getTime() : false

  // Tournament final result
  const finalMatch = useMemo(
    () => matches.find(m => m.round === 'FINAL' && m.status === 'FINISHED'),
    [matches]
  )
  const tournamentWinnerId = finalMatch?.winnerTeamId ?? null

  const myTeam = myPick ? teamMap[myPick.teamId] : null

  const handleSave = async (teamId: string) => {
    if (!user || isLocked) return
    setSaving(true)
    try {
      await setDoc(doc(db, 'picks', user.uid), {
        userId: user.uid,
        teamId,
        submittedAt: myPick?.submittedAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      setModalOpen(false)
    } finally {
      setSaving(false)
    }
  }

  if (!user || myPick === undefined) return null

  // Community pick counts
  const pickCounts: Record<string, number> = {}
  for (const p of allPicks) pickCounts[p.teamId] = (pickCounts[p.teamId] ?? 0) + 1

  return (
    <>
      <div className="mt-5 text-left">
        <div className={`bg-slate-800 rounded-xl p-4 border ${
          myPick?.bonusPoints ? 'border-yellow-600/50' : 'border-slate-700'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🏆</span>
              <span className="text-sm font-semibold text-slate-200">Tournament Winner Pick</span>
            </div>
            {myPick?.bonusPoints && (
              <span className="text-xs font-bold text-yellow-400 bg-yellow-900/40 px-2 py-0.5 rounded-full">
                +{myPick.bonusPoints} pts!
              </span>
            )}
          </div>

          {myPick && myTeam ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{myTeam.flagEmoji}</span>
                <div>
                  <div className="text-white font-bold">{myTeam.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {isLocked
                      ? tournamentWinnerId
                        ? tournamentWinnerId === myPick.teamId
                          ? '🎉 Correct! Bonus points awarded.'
                          : `Eliminated · Winner was ${teamMap[tournamentWinnerId]?.name ?? tournamentWinnerId}`
                        : 'Locked · awaiting knockout result'
                      : `Can change until group stage ends · ${BONUS_PTS} pts if correct`}
                  </div>
                </div>
              </div>
              {!isLocked && (
                <button
                  onClick={() => setModalOpen(true)}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Change
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-slate-400 text-sm">
                {isLocked ? 'Picks are now locked.' : `Pick the winner for ${BONUS_PTS} bonus points!`}
              </p>
              {!isLocked && (
                <button
                  onClick={() => setModalOpen(true)}
                  className="shrink-0 text-sm bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
                >
                  Pick
                </button>
              )}
            </div>
          )}

          {!isLocked && lockDate && (
            <LockCountdown lockDate={lockDate} />
          )}
        </div>
      </div>

      {modalOpen && (
        <TeamPickerModal
          teams={teamMap}
          currentPickId={myPick?.teamId}
          pickCounts={pickCounts}
          saving={saving}
          onPick={handleSave}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}

function LockCountdown({ lockDate }: { lockDate: Date }) {
  const [label, setLabel] = useState('')

  useEffect(() => {
    const calc = () => {
      const diff = lockDate.getTime() - Date.now()
      if (diff <= 0) { setLabel(''); return }
      const d = Math.floor(diff / 86_400_000)
      const h = Math.floor((diff % 86_400_000) / 3_600_000)
      const m = Math.floor((diff % 3_600_000) / 60_000)
      if (d > 0) setLabel(`Locks in ${d}d ${h}h`)
      else if (h > 0) setLabel(`Locks in ${h}h ${m}m`)
      else setLabel(`Locks in ${m}m`)
    }
    calc()
    const id = setInterval(calc, 60_000)
    return () => clearInterval(id)
  }, [lockDate])

  if (!label) return null
  return <div className="text-xs text-amber-400/80 mt-2">{label}</div>
}

function TeamPickerModal({
  teams,
  currentPickId,
  pickCounts,
  saving,
  onPick,
  onClose,
}: {
  teams: Record<string, Team>
  currentPickId: string | undefined
  pickCounts: Record<string, number>
  saving: boolean
  onPick: (teamId: string) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(currentPickId ?? '')

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const teamList = useMemo(() => {
    const q = search.toLowerCase()
    return Object.values(teams).filter(
      t => !q || t.name.toLowerCase().includes(q) || t.shortName.toLowerCase().includes(q)
    ).sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name))
  }, [teams, search])

  // Group by group letter
  const byGroup = useMemo(() => {
    const g: Record<string, Team[]> = {}
    for (const t of teamList) {
      if (!g[t.group]) g[t.group] = []
      g[t.group].push(t)
    }
    return g
  }, [teamList])

  const groups = Object.keys(byGroup).sort()

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative bg-slate-900 rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-md flex flex-col"
        style={{ maxHeight: '90dvh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-slate-700 shrink-0">
          <span className="text-xl">🏆</span>
          <div className="flex-1 min-w-0">
            <div className="text-white font-bold">Pick the Tournament Winner</div>
            <div className="text-slate-400 text-xs">{BONUS_PTS} bonus points if correct</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 transition-colors touch-manipulation">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2.5 border-b border-slate-700 shrink-0">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search team…"
            autoFocus
            className="w-full bg-slate-800 text-white rounded-lg px-3 py-2 text-sm border border-slate-700 focus:outline-none focus:border-blue-500 placeholder:text-slate-500"
          />
        </div>

        {/* Team list */}
        <div className="overflow-y-auto flex-1">
          {groups.map(group => (
            <div key={group}>
              <div className="px-4 py-1.5 text-xs text-slate-500 uppercase tracking-wider bg-slate-800/50 sticky top-0">
                Group {group}
              </div>
              {byGroup[group].map(team => {
                const isSelected = selected === team.id
                const count = pickCounts[team.id] ?? 0
                return (
                  <button
                    key={team.id}
                    onClick={() => setSelected(team.id)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      isSelected
                        ? 'bg-blue-600/20 border-l-2 border-blue-500'
                        : 'hover:bg-slate-800 border-l-2 border-transparent'
                    }`}
                  >
                    <span className="text-2xl leading-none">{team.flagEmoji}</span>
                    <span className="flex-1 text-white font-medium text-sm">{team.name}</span>
                    {count > 0 && (
                      <span className="text-xs text-slate-500">{count} pick{count !== 1 ? 's' : ''}</span>
                    )}
                    {isSelected && (
                      <span className="text-blue-400 text-sm font-bold">✓</span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-slate-700 px-4 py-3 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-slate-600 text-slate-300 hover:text-white text-sm font-medium transition-colors">
            Cancel
          </button>
          <button
            onClick={() => selected && onPick(selected)}
            disabled={!selected || saving || selected === currentPickId}
            className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
          >
            {saving ? 'Saving…' : 'Confirm Pick'}
          </button>
        </div>
      </div>
    </div>
  )
}
