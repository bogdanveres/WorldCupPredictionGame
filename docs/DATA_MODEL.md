# Data Model

## TypeScript Interfaces

```typescript
// src/types/index.ts

export type MatchStatus = 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'POSTPONED' | 'ABANDONED';

export type MatchRound =
  | 'GROUP'
  | 'ROUND_OF_32'
  | 'ROUND_OF_16'
  | 'QUARTER_FINAL'
  | 'SEMI_FINAL'
  | 'THIRD_PLACE'
  | 'FINAL';

export type Confederation = 'UEFA' | 'CONMEBOL' | 'CONCACAF' | 'CAF' | 'AFC' | 'OFC';

export interface Team {
  id: string;                    // e.g. "ARG"
  name: string;                  // "Argentina"
  shortName: string;             // "ARG"
  flagEmoji: string;             // "🇦🇷"
  group: string;                 // "A" through "L"
  confederation: Confederation;
  fifaRanking?: number;
  externalId?: string;           // ID in external API
}

export interface Match {
  id: string;                         // "match_001" or API id
  round: MatchRound;
  group?: string;                     // "A"–"L", only for GROUP round
  homeTeamId: string;                 // Team.id or "TBD"
  awayTeamId: string;
  scheduledKickoffUtc: string;        // ISO 8601, e.g. "2026-06-11T16:00:00Z"
  scheduledKickoffRomaniaTime: string; // derived, "2026-06-11T19:00:00+03:00"
  venue: string;
  city: string;
  country: string;
  status: MatchStatus;
  homeScore: number | null;
  awayScore: number | null;
  homeScoreHT?: number | null;        // half-time
  awayScoreHT?: number | null;
  winnerTeamId: string | null;        // null for draws or unfinished
  externalId?: string;                // ID in external API
  lastUpdated?: string;               // ISO 8601
}

export interface Prediction {
  id: string;                         // "{userId}_{matchId}"
  userId: string;
  matchId: string;
  predictedHomeScore: number;
  predictedAwayScore: number;
  submittedAt: string;                // ISO 8601
  updatedAt: string;
  lockedAt: string | null;            // set when match kicks off
  pointsAwarded: number | null;       // null until result entered
  isManualEntry: boolean;
  manuallyEnteredByAdmin: string | null; // admin uid
}

export interface User {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  createdAt: string;
  totalPoints: number;
  rank: number;
  exactScoreCount: number;
  correctOutcomeCount: number;
  predictionsSubmitted: number;
  lastActive: string;
}

export interface LeaderboardEntry {
  uid: string;
  displayName: string;
  photoURL: string | null;
  totalPoints: number;
  rank: number;
  exactScoreCount: number;
  correctOutcomeCount: number;
  correctDrawCount: number;
  predictionsSubmitted: number;
  lastCalculated: string;
}

export interface Standing {
  teamId: string;
  group: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  qualificationStatus: 'QUALIFIED' | 'ELIMINATED' | 'TBD';
}

export interface AppConfig {
  useOfficialFullTimeScore: boolean;  // true = 90-min score only
  tournamentStartDate: string;
  tournamentEndDate: string;
  dataProvider: 'local' | 'api' | 'firestore';
  liveRefreshIntervalSeconds: number;
  adminEmails: string[];
  lastLeaderboardUpdate: string;
}

export interface AdminAuditLog {
  id: string;
  adminUid: string;
  action: string;                     // "UPDATE_RESULT" | "MANUAL_PREDICTION" | "RECALCULATE"
  targetCollection: string;
  targetDocId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  timestamp: string;
}

export interface ManualEntry {
  id: string;
  userId: string;
  matchId: string;
  predictedHomeScore: number;
  predictedAwayScore: number;
  enteredByAdmin: string;
  enteredAt: string;
  reason: string;
}
```

## Firestore Collections

### `teams/{teamId}`

```json
{
  "id": "ARG",
  "name": "Argentina",
  "shortName": "ARG",
  "flagEmoji": "🇦🇷",
  "group": "A",
  "confederation": "CONMEBOL",
  "fifaRanking": 1,
  "externalId": "762"
}
```

### `matches/{matchId}`

```json
{
  "id": "match_001",
  "round": "GROUP",
  "group": "A",
  "homeTeamId": "MEX",
  "awayTeamId": "ARG",
  "scheduledKickoffUtc": "2026-06-11T20:00:00Z",
  "scheduledKickoffRomaniaTime": "2026-06-11T23:00:00+03:00",
  "venue": "SoFi Stadium",
  "city": "Inglewood",
  "country": "USA",
  "status": "SCHEDULED",
  "homeScore": null,
  "awayScore": null,
  "homeScoreHT": null,
  "awayScoreHT": null,
  "winnerTeamId": null,
  "externalId": "491234",
  "lastUpdated": "2026-01-15T10:00:00Z"
}
```

### `predictions/{userId}_{matchId}`

```json
{
  "id": "uid123_match_001",
  "userId": "uid123",
  "matchId": "match_001",
  "predictedHomeScore": 1,
  "predictedAwayScore": 2,
  "submittedAt": "2026-06-10T14:32:00Z",
  "updatedAt": "2026-06-10T18:05:00Z",
  "lockedAt": null,
  "pointsAwarded": null,
  "isManualEntry": false,
  "manuallyEnteredByAdmin": null
}
```

### `users/{uid}`

```json
{
  "uid": "uid123",
  "displayName": "Ion Popescu",
  "email": "ion@example.com",
  "photoURL": "https://lh3.googleusercontent.com/...",
  "createdAt": "2026-05-01T09:00:00Z",
  "totalPoints": 47,
  "rank": 3,
  "exactScoreCount": 8,
  "correctOutcomeCount": 20,
  "predictionsSubmitted": 62,
  "lastActive": "2026-06-15T20:00:00Z"
}
```

### `leaderboard/{uid}`

```json
{
  "uid": "uid123",
  "displayName": "Ion Popescu",
  "photoURL": "https://lh3.googleusercontent.com/...",
  "totalPoints": 47,
  "rank": 3,
  "exactScoreCount": 8,
  "correctOutcomeCount": 20,
  "correctDrawCount": 5,
  "predictionsSubmitted": 62,
  "lastCalculated": "2026-06-15T22:00:00Z"
}
```

### `standings/{group}`

```json
{
  "group": "A",
  "teams": [
    {
      "teamId": "ARG",
      "played": 3,
      "won": 2,
      "drawn": 1,
      "lost": 0,
      "goalsFor": 7,
      "goalsAgainst": 2,
      "goalDifference": 5,
      "points": 7,
      "qualificationStatus": "QUALIFIED"
    }
  ],
  "lastUpdated": "2026-06-20T22:00:00Z"
}
```

### `appConfig/main`

```json
{
  "useOfficialFullTimeScore": true,
  "tournamentStartDate": "2026-06-11",
  "tournamentEndDate": "2026-07-19",
  "dataProvider": "local",
  "liveRefreshIntervalSeconds": 60,
  "adminEmails": ["admin@example.com"],
  "lastLeaderboardUpdate": "2026-06-15T22:00:00Z"
}
```

### `adminAuditLog/{logId}`

```json
{
  "id": "log_20260615_001",
  "adminUid": "adminUid456",
  "action": "UPDATE_RESULT",
  "targetCollection": "matches",
  "targetDocId": "match_001",
  "before": { "status": "LIVE", "homeScore": null, "awayScore": null },
  "after": { "status": "FINISHED", "homeScore": 2, "awayScore": 1 },
  "timestamp": "2026-06-15T22:05:00Z"
}
```

### `manualEntries/{entryId}`

```json
{
  "id": "entry_001",
  "userId": "uid123",
  "matchId": "match_001",
  "predictedHomeScore": 2,
  "predictedAwayScore": 0,
  "enteredByAdmin": "adminUid456",
  "enteredAt": "2026-06-16T10:00:00Z",
  "reason": "User submitted prediction via WhatsApp before match"
}
```

## Indexes Required

Firestore composite indexes needed:

```
predictions: userId ASC, matchId ASC
predictions: userId ASC, pointsAwarded DESC
matches: status ASC, scheduledKickoffUtc ASC
matches: round ASC, group ASC, scheduledKickoffUtc ASC
leaderboard: totalPoints DESC, exactScoreCount DESC
```

These should be declared in `firestore.indexes.json`.

## Naming Conventions

- Collection names: camelCase plural (`matches`, `predictions`, `leaderboard`)
- Document IDs: snake_case or composite (`{userId}_{matchId}`)
- Field names: camelCase
- Timestamps: ISO 8601 strings (not Firestore Timestamps) for simplicity with TypeScript
- Team IDs: 3-letter FIFA country code (`ARG`, `FRA`, `USA`)
- Match IDs: sequential `match_001` through `match_104` for local JSON; API string IDs for remote
