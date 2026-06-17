import { useState, useEffect, useRef } from 'react'
import { useData } from '../contexts/DataContext'
import MatchCard from '../components/fixtures/MatchCard'
import type { MatchRound } from '../types'
import { romaniaGameDateStr, todayRomaniaGameDateStr } from '../utils/timezone'

const GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L']

const ROUNDS: { value: MatchRound | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'GROUP', label: 'Group Stage' },
  { value: 'ROUND_OF_32', label: 'Round of 32' },
  { value: 'ROUND_OF_16', label: 'Round of 16' },
  { value: 'QUARTER_FINAL', label: 'Quarter-finals' },
  { value: 'SEMI_FINAL', label: 'Semi-finals' },
  { value: 'THIRD_PLACE', label: 'Third Place' },
  { value: 'FINAL', label: 'Final' },
]

export default function Fixtures() {
  const [selectedRound, setSelectedRound] = useState<MatchRound | 'ALL'>('ALL')
  const [selectedGroup, setSelectedGroup] = useState<string>('ALL')
  const { getMatches, teamMap } = useData()
  const todayRef = useRef<HTMLDivElement>(null)

  const allMatches = getMatches(selectedRound !== 'ALL' ? { round: selectedRound } : undefined)

  const filtered = allMatches.filter(m =>
    selectedGroup === 'ALL' || m.group === selectedGroup
  )

  const [today, setToday] = useState(todayRomaniaGameDateStr)

  useEffect(() => {
    const timer = setInterval(() => setToday(todayRomaniaGameDateStr()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const byDate = filtered.reduce<Record<string, typeof filtered>>((acc, m) => {
    const day = romaniaGameDateStr(m.scheduledKickoffUtc)
    ;(acc[day] ??= []).push(m)
    return acc
  }, {})

  const sortedDays = Object.keys(byDate).sort()
  const hasToday = sortedDays.includes(today)

  const scrollToToday = () => {
    todayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Auto-scroll to today on initial load
  useEffect(() => {
    if (todayRef.current) {
      setTimeout(() => todayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    }
  }, [])

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white">Fixtures</h1>
        {hasToday && (
          <button
            onClick={scrollToToday}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold transition-colors"
          >
            <span>⚽</span> Today
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {ROUNDS.map(r => (
          <button
            key={r.value}
            onClick={() => { setSelectedRound(r.value); setSelectedGroup('ALL') }}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              selectedRound === r.value
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {(selectedRound === 'ALL' || selectedRound === 'GROUP') && (
        <div className="flex flex-wrap gap-1.5 mb-6">
          <button
            onClick={() => setSelectedGroup('ALL')}
            className={`px-2.5 py-1 rounded text-xs font-medium ${
              selectedGroup === 'ALL' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
            }`}
          >
            All Groups
          </button>
          {GROUPS.map(g => (
            <button
              key={g}
              onClick={() => setSelectedGroup(g)}
              className={`px-2.5 py-1 rounded text-xs font-medium ${
                selectedGroup === g ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
            >
              Group {g}
            </button>
          ))}
        </div>
      )}

      {sortedDays.length === 0 && (
        <p className="text-slate-400">No matches found.</p>
      )}

      {sortedDays.map(day => {
        const isToday = day === today
        return (
          <div
            key={day}
            ref={isToday ? todayRef : undefined}
            className={`mb-6 ${isToday ? 'rounded-xl ring-2 ring-amber-500/60 bg-amber-500/5 p-4' : ''}`}
          >
            <h2 className={`text-sm font-semibold uppercase tracking-wider mb-3 flex items-center gap-2 ${isToday ? 'text-amber-400' : 'text-slate-400'}`}>
              {new Date(day + 'T12:00:00Z').toLocaleDateString('en-GB', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
              })}
              {isToday && (
                <span className="bg-amber-500 text-black text-xs font-bold px-2 py-0.5 rounded-full">
                  TODAY
                </span>
              )}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {byDate[day].map(m => (
                <MatchCard
                  key={m.id}
                  match={m}
                  homeTeam={teamMap[m.homeTeamId]}
                  awayTeam={teamMap[m.awayTeamId]}
                  isToday={isToday}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
