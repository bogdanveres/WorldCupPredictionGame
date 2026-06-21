export type MatchStatus = 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'POSTPONED' | 'ABANDONED'

export type MatchRound =
  | 'GROUP'
  | 'ROUND_OF_32'
  | 'ROUND_OF_16'
  | 'QUARTER_FINAL'
  | 'SEMI_FINAL'
  | 'THIRD_PLACE'
  | 'FINAL'

export type Confederation = 'UEFA' | 'CONMEBOL' | 'CONCACAF' | 'CAF' | 'AFC' | 'OFC'

export interface Team {
  id: string
  name: string
  shortName: string
  flagEmoji: string
  group: string
  confederation: Confederation
  fifaRanking?: number
  externalId?: string
}

export interface Match {
  id: string
  round: MatchRound
  group?: string
  homeTeamId: string
  awayTeamId: string
  scheduledKickoffUtc: string
  scheduledKickoffRomaniaTime: string
  venue: string
  city: string
  country: string
  status: MatchStatus
  homeScore: number | null
  awayScore: number | null
  homeScoreHT?: number | null
  awayScoreHT?: number | null
  winnerTeamId: string | null
  externalId?: string
  lastUpdated?: string
}

export interface Prediction {
  id: string
  userId: string
  matchId: string
  predictedHomeScore: number
  predictedAwayScore: number
  submittedAt: string
  updatedAt: string
  lockedAt: string | null
  pointsAwarded: number | null
  isManualEntry: boolean
  manuallyEnteredByAdmin: string | null
}

export interface User {
  uid: string
  displayName: string
  email: string
  photoURL: string | null
  createdAt: string
  totalPoints: number
  rank: number
  exactScoreCount: number
  correctOutcomeCount: number
  predictionsSubmitted: number
  lastActive: string
}

export interface LeaderboardEntry {
  uid: string
  displayName: string
  photoURL: string | null
  totalPoints: number
  rank: number
  previousRank: number | null
  exactScoreCount: number
  correctOutcomeCount: number
  correctDrawCount: number
  predictionsSubmitted: number
  lastCalculated: string
}

export interface GroupStanding {
  teamId: string
  group: string
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  points: number
  qualificationStatus: 'QUALIFIED' | 'ELIMINATED' | 'TBD'
}

export interface AppConfig {
  useOfficialFullTimeScore: boolean
  tournamentStartDate: string
  tournamentEndDate: string
  dataProvider: 'local' | 'api' | 'firestore'
  liveRefreshIntervalSeconds: number
  adminEmails: string[]
  lastLeaderboardUpdate: string
}

export interface MatchFilter {
  round?: MatchRound
  group?: string
  status?: MatchStatus
  teamId?: string
  dateFrom?: string
  dateTo?: string
}
