# Architecture

## Overview

Static SPA on GitHub Pages + Firebase backend services. No server-side code required.

```
Browser
  │
  ├── React SPA (GitHub Pages CDN)
  │     ├── Firebase Auth SDK  ──────────────► Firebase Auth
  │     ├── Firestore SDK  ─────────────────► Cloud Firestore
  │     └── Data Provider  ──────────────────► Local JSON / External API
  │
  └── GitHub Actions (build + deploy on push)
```

## Frontend Architecture

### Technology Choices

| Choice | Reason |
|---|---|
| React 18 | Component model, hooks, large ecosystem |
| TypeScript | Type safety for complex match/prediction data models |
| Vite | Fast HMR, native ESM, simple GitHub Pages config |
| Tailwind CSS | Utility-first, mobile-first, no runtime overhead |
| date-fns-tz | Lightweight, reliable UTC→Romania timezone conversion |
| React Router | Client-side routing for SPA |

### Page Map

```
/                   Home dashboard (upcoming + live matches)
/fixtures           All matches, filterable by group/round/date
/predictions        My predictions (auth required)
/groups             Group stage standings
/standings          Combined standings view
/bracket            Knockout bracket
/leaderboard        Points table
/stats/:userId      User stats
/profile            My profile (auth required)
/admin              Admin panel (admin email required)
/login              Login page
```

### Component Tree (simplified)

```
App
├── AuthProvider          (Firebase auth context)
├── DataProvider          (match/team data context)
├── Router
│   ├── Navbar
│   ├── Pages (lazy loaded)
│   └── Footer
```

### State Management

- Firebase Auth state: React context (`AuthContext`)
- Match/team data: React context (`DataContext`) + local cache
- User predictions: Firestore real-time listener
- Leaderboard: Firestore real-time listener
- UI state: component-local `useState`
- No Redux or Zustand — Firestore listeners handle shared data

## Firebase Usage

### Authentication

Firebase Auth with Google provider. After login:
1. `onAuthStateChanged` fires with user object
2. Upsert user doc in Firestore `users/{uid}`
3. Check if email is in admin list → set admin flag in context

### Firestore

Collections and access patterns:

| Collection | Read | Write |
|---|---|---|
| `teams` | anyone | admin only |
| `matches` | anyone | admin only |
| `standings` | anyone | Cloud Function / admin |
| `predictions` | owner | owner (before kickoff), admin |
| `users` | owner (own), leaderboard fields public | owner (own profile) |
| `leaderboard` | anyone | Cloud Function / admin |
| `appConfig` | anyone | admin |
| `adminAuditLog` | admin | admin |
| `manualEntries` | admin | admin |

### No Cloud Functions (MVP)

Scoring recalculation runs in the browser triggered by admin. This avoids Firebase Blaze (paid) plan requirement.

On admin "Recalculate" action:
1. Fetch all finished matches
2. Fetch all predictions
3. Compute points per prediction
4. Batch-write updated predictions and user totals to Firestore

Trade-off: not automatic, but keeps cost zero.

## Data Flow

### Match Data Flow

```
On app load:
  DataProvider.initialize()
    └── try: fetch from external API (if VITE_DATA_PROVIDER=api)
        fallback: load local teams.json + fixtures.json
        override: Firestore matches collection (admin-updated results)

Match result is always taken from Firestore if present (admin override wins).
```

### Prediction Flow

```
User views fixture
  └── load prediction for this match from Firestore (if exists)

User submits prediction
  └── check: match.scheduledKickoffUtc > now()
      └── write to Firestore predictions/{userId}_{matchId}
          fields: predictedHomeScore, predictedAwayScore, submittedAt

Match kicks off
  └── Firestore rule blocks writes to predictions where kickoff passed

Admin enters result
  └── write match.homeScore, match.awayScore, match.status=FINISHED

Admin recalculates
  └── read all predictions for finished matches
      compute points per prediction
      batch write pointsAwarded back to predictions
      aggregate user totals → write to users/{uid} + leaderboard
```

### Live Match Refresh

```
Fixtures page mounts
  └── setInterval (60s) while any match status=LIVE
      └── DataProvider.getLiveMatches()
          └── fetch from API or Firestore (admin-updated)
```

## Data Provider Strategy

Adapter pattern — swap data source without changing UI components.

```typescript
interface DataProvider {
  getTeams(): Promise<Team[]>
  getMatches(filters?: MatchFilter): Promise<Match[]>
  getMatch(id: string): Promise<Match>
  getLiveMatches(): Promise<Match[]>
  getStandings(group: string): Promise<Standing[]>
}
```

Active provider selected by `VITE_DATA_PROVIDER` env var:

- `local` — reads `src/data/teams.json` + `src/data/fixtures.json`
- `api` — calls football-data.org (or other configured API)
- `firestore` — reads Firestore matches collection (admin-maintained)

Firestore match results always override schedule data regardless of provider.

## Why GitHub Pages + Firebase

| Requirement | Solution | Cost |
|---|---|---|
| Static hosting | GitHub Pages | Free |
| Auth | Firebase Auth (Google) | Free (Spark) |
| Database | Firestore | Free up to 50k reads/day |
| CI/CD | GitHub Actions | Free for public repos |
| Domain | github.io subdomain | Free |
| SSL | Included with GitHub Pages | Free |

Firestore free tier (Spark plan):
- 50,000 document reads/day
- 20,000 document writes/day
- 20,000 document deletes/day
- 1 GiB storage

For ~50 players over a 1-month tournament this is sufficient with careful query design (avoid unbounded listeners, use pagination).

## Security Model

- All Firebase API keys are public (normal for Firebase) — security enforced by Firestore Rules, not key secrecy
- Admin check done server-side in Firestore Rules via custom claims OR email list (simpler, good enough for small group)
- Predictions locked by Firestore Rules comparing `request.time` to `match.scheduledKickoffUtc`
- Users cannot write to `matches`, `teams`, `standings`, or `leaderboard` collections
