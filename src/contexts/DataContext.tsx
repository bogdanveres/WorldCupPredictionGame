import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../services/firebase'
import type { Match, Team, MatchFilter } from '../types'
import teamsData from '../data/teams.json'
import fixturesData from '../data/fixtures.json'
import { resolveConfirmedKnockout } from '../utils/bracketResolve'

const localTeams = teamsData as Team[]
const localMatches = fixturesData as Match[]

interface DataContextValue {
  teams: Team[]
  matches: Match[]
  loading: boolean
  teamMap: Record<string, Team>
  getMatches: (filters?: MatchFilter) => Match[]
  getMatch: (id: string) => Match | undefined
  getTeam: (id: string) => Team | undefined
}

const DataContext = createContext<DataContextValue | null>(null)

function applyFilters(matches: Match[], filters?: MatchFilter): Match[] {
  if (!filters) return matches
  return matches.filter(m => {
    if (filters.round && m.round !== filters.round) return false
    if (filters.group && m.group !== filters.group) return false
    if (filters.status && m.status !== filters.status) return false
    if (filters.teamId && m.homeTeamId !== filters.teamId && m.awayTeamId !== filters.teamId) return false
    if (filters.dateFrom && m.scheduledKickoffUtc < filters.dateFrom) return false
    if (filters.dateTo && m.scheduledKickoffUtc > filters.dateTo) return false
    return true
  })
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [matches, setMatches] = useState<Match[]>(() => resolveConfirmedKnockout(localMatches))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'matches'),
      snap => {
        if (!snap.empty) {
          const fsMap = Object.fromEntries(
            snap.docs.map(d => [d.id, d.data() as Match]),
          )
          const merged: Match[] = localMatches.map(m => {
            const fs = fsMap[m.id]
            if (!fs) return m
            // If local has a confirmed result but Firestore is still SCHEDULED
            // (cron missed the window), trust local scores so the bracket stays accurate.
            if (m.status === 'FINISHED' && fs.status === 'SCHEDULED') {
              return { ...m, ...fs, status: 'FINISHED', homeScore: m.homeScore, awayScore: m.awayScore, winnerTeamId: m.winnerTeamId }
            }
            return { ...m, ...fs }
          })
          // Resolve TBD knockout slots from confirmed group standings + finished
          // feeder-match winners, so every page (Fixtures, My Picks, …) shows the
          // real opponent instead of TBD once it is mathematically locked in.
          setMatches(resolveConfirmedKnockout(merged))
        }
        setLoading(false)
      },
      () => setLoading(false),
    )
    return unsub
  }, [])

  const teamMap = Object.fromEntries(localTeams.map(t => [t.id, t]))

  const value: DataContextValue = {
    teams: localTeams,
    matches,
    loading,
    teamMap,
    getMatches: (filters?) => applyFilters(matches, filters),
    getMatch: id => matches.find(m => m.id === id),
    getTeam: id => teamMap[id],
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be inside DataProvider')
  return ctx
}
