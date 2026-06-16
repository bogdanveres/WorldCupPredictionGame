import { LocalJsonProvider } from '../providers/LocalJsonProvider'
import type { MatchFilter } from '../types'

export function useTeams() {
  return LocalJsonProvider.getTeams()
}

export function useTeam(id: string) {
  return LocalJsonProvider.getTeam(id)
}

export function useMatches(filters?: MatchFilter) {
  return LocalJsonProvider.getMatches(filters)
}

export function useMatch(id: string) {
  return LocalJsonProvider.getMatch(id)
}

export function useGroupStandings(group?: string) {
  return LocalJsonProvider.getGroupStandings(group)
}

export function useTeamMap() {
  const teams = LocalJsonProvider.getTeams()
  return Object.fromEntries(teams.map(t => [t.id, t]))
}
