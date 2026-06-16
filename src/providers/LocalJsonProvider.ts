import type { Team, Match, MatchFilter, GroupStanding } from '../types'
import teamsData from '../data/teams.json'
import fixturesData from '../data/fixtures.json'

const teams = teamsData as Team[]
const matches = fixturesData as Match[]

function applyFilter(list: Match[], filters?: MatchFilter): Match[] {
  if (!filters) return list
  return list.filter(m => {
    if (filters.round && m.round !== filters.round) return false
    if (filters.group && m.group !== filters.group) return false
    if (filters.status && m.status !== filters.status) return false
    if (filters.teamId && m.homeTeamId !== filters.teamId && m.awayTeamId !== filters.teamId) return false
    if (filters.dateFrom && m.scheduledKickoffUtc < filters.dateFrom) return false
    if (filters.dateTo && m.scheduledKickoffUtc > filters.dateTo) return false
    return true
  })
}

export const LocalJsonProvider = {
  getTeams(): Team[] {
    return teams
  },

  getTeam(id: string): Team | undefined {
    return teams.find(t => t.id === id)
  },

  getMatches(filters?: MatchFilter): Match[] {
    return applyFilter(matches, filters)
  },

  getMatch(id: string): Match | undefined {
    return matches.find(m => m.id === id)
  },

  getLiveMatches(): Match[] {
    return matches.filter(m => m.status === 'LIVE')
  },

  getGroupStandings(group?: string): GroupStanding[] {
    const groupMatches = matches.filter(
      m => m.round === 'GROUP' && m.status === 'FINISHED' && (group ? m.group === group : true)
    )

    const standingsMap = new Map<string, GroupStanding>()

    const ensureTeam = (teamId: string, grp: string) => {
      if (!standingsMap.has(teamId)) {
        standingsMap.set(teamId, {
          teamId,
          group: grp,
          played: 0, won: 0, drawn: 0, lost: 0,
          goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
          qualificationStatus: 'TBD',
        })
      }
      return standingsMap.get(teamId)!
    }

    for (const m of groupMatches) {
      if (m.homeScore === null || m.awayScore === null || !m.group) continue
      const home = ensureTeam(m.homeTeamId, m.group)
      const away = ensureTeam(m.awayTeamId, m.group)

      home.played++; away.played++
      home.goalsFor += m.homeScore; home.goalsAgainst += m.awayScore
      away.goalsFor += m.awayScore; away.goalsAgainst += m.homeScore

      if (m.homeScore > m.awayScore) {
        home.won++; home.points += 3; away.lost++
      } else if (m.homeScore < m.awayScore) {
        away.won++; away.points += 3; home.lost++
      } else {
        home.drawn++; home.points += 1; away.drawn++; away.points += 1
      }

      home.goalDifference = home.goalsFor - home.goalsAgainst
      away.goalDifference = away.goalsFor - away.goalsAgainst
    }

    return Array.from(standingsMap.values()).sort((a, b) =>
      b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor
    )
  },
}
