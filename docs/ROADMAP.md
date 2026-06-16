# Roadmap

## MVP (Phase 1) — Tournament-Ready Core

**Goal:** Working prediction game before June 11, 2026 kickoff.

### Setup
- [ ] Vite + React + TypeScript project scaffold
- [ ] Tailwind CSS configured
- [ ] Firebase project created and configured
- [ ] GitHub repository + GitHub Actions deploy workflow
- [ ] `.env.example` and documentation

### Authentication
- [ ] Firebase Auth with Google Sign-In
- [ ] `AuthContext` with `useAuth` hook
- [ ] User profile auto-created in Firestore on first login
- [ ] Login page with Google button
- [ ] Profile page
- [ ] Logout

### Data Foundation
- [ ] TypeScript interfaces (`types/index.ts`)
- [ ] Static `teams.json` with all 48 teams (once confirmed by FIFA)
- [ ] Static `fixtures.json` with all 104 matches + Romania kickoff times
- [ ] `LocalJsonProvider` reading these files
- [ ] `DataContext` with `useData` hook
- [ ] Timezone utility (UTC → Europe/Bucharest display)

### Fixtures Page
- [ ] List all matches
- [ ] Filter by group / round / date
- [ ] Show Romania kickoff time
- [ ] Show match status badge (SCHEDULED / LIVE / FINISHED)
- [ ] Show scores when FINISHED
- [ ] Show "LIVE" green badge with auto-refresh

### Predictions
- [ ] Prediction form on each match card
- [ ] Submit prediction to Firestore
- [ ] Edit prediction before kickoff
- [ ] Lock prediction at kickoff (Firestore rule + UI)
- [ ] Show my prediction on each match
- [ ] My Predictions page (all predictions in one view)

### Admin: Match Results
- [ ] Admin panel (email-gated)
- [ ] Update match score and status
- [ ] Detect admin email from env var

### Scoring
- [ ] Scoring calculation function (`utils/scoring.ts`)
- [ ] Admin recalculate button
- [ ] Write `pointsAwarded` to predictions
- [ ] Aggregate totals to `users` + `leaderboard`

### Leaderboard
- [ ] Leaderboard page
- [ ] Sort by points
- [ ] Show rank, name, avatar, points, exact scores, correct outcomes
- [ ] Tiebreaker logic

### Groups & Standings
- [ ] Groups page — all 12 groups
- [ ] Calculate standings from match results
- [ ] Show team flags, played, W/D/L, GF/GA/GD/Points

### Deployment
- [ ] GitHub Pages deploy via Actions
- [ ] Firestore security rules
- [ ] Firestore indexes

---

## V1 — Live Data & Polish

**Goal:** Auto-sync scores + improved UX.

### Live Data
- [ ] `ApiProvider` for football-data.org
- [ ] Auto-refresh live matches (60s interval)
- [ ] Import teams/fixtures from API
- [ ] Map external IDs to internal IDs

### Bracket
- [ ] Knockout bracket visual
- [ ] Round of 32, 16, QF, SF, 3rd place, Final
- [ ] Show qualified teams / TBD
- [ ] Mobile-friendly bracket

### Admin Improvements
- [ ] Manual prediction entry for past matches
- [ ] Missing predictions inspector
- [ ] Import teams/fixtures from JSON upload
- [ ] Audit log viewer

### User Stats
- [ ] Detailed user stats page
- [ ] Points by round
- [ ] Points by group
- [ ] Success rate
- [ ] Recent results

### UX Polish
- [ ] Loading skeletons
- [ ] Empty state illustrations
- [ ] Toast notifications on save
- [ ] Offline indicator
- [ ] PWA manifest + service worker (installable on mobile)

### Performance
- [ ] Pagination for leaderboard (Firestore cursor-based)
- [ ] Lazy load pages
- [ ] Firestore offline persistence

---

## V2 — Nice-to-Have Features

**Goal:** Fun extras if time allows.

### Social / Gamification
- [ ] Prediction comments (user can add note to prediction)
- [ ] Mini-leagues (groups of friends with private leaderboard)
- [ ] Share prediction card as image
- [ ] "Streak" counter (correct outcomes in a row)

### Predictions UX
- [ ] Quick prediction mode (swipe or tap to pick score from shortcuts)
- [ ] Prediction deadline countdown
- [ ] "Feeling lucky" random score button

### Advanced Stats
- [ ] Head-to-head stats between users
- [ ] Best/worst performing groups
- [ ] Historical charts (points over time)
- [ ] Team fan stats (who predicted most for Argentina etc.)

### Admin
- [ ] Export full database as JSON backup
- [ ] Email notifications for admin alerts (via Firebase Extensions)
- [ ] CSV import for predictions

### Automated Scoring
- [ ] Firebase Cloud Function triggered by Firestore match update
- [ ] Auto-recalculate when admin sets match to FINISHED
- [ ] Removes need for manual recalculate button

### Internationalization
- [ ] Romanian language option
- [ ] Date formatting locale

### Bonus Predictions
- [ ] Golden Boot prediction (top scorer)
- [ ] Tournament winner prediction
- [ ] Group winner prediction
- [ ] Points awarded as bonus at end of tournament

---

## Known Constraints

| Constraint | Impact |
|---|---|
| GitHub Pages (static) | No server-side automation; admin triggers recalculate manually |
| Firebase Spark (free) | 50k reads/day limit; ~20 users × 104 matches × 3 reads = well within limit |
| football-data.org free tier | 10 req/min; only poll during live matches |
| No Cloud Functions (Spark plan) | Scoring calc runs in browser |
| World Cup 2026 team list | Not all 48 teams confirmed as of dev time — use placeholders |

## Timeline Suggestion

| Date | Milestone |
|---|---|
| Now → May 2026 | MVP development |
| May 1, 2026 | Alpha: auth + fixtures + prediction submission |
| May 15, 2026 | Beta: scoring + leaderboard + groups |
| June 1, 2026 | Production deploy + invite users |
| June 11, 2026 | Tournament starts — all predictions locked at kickoff |
| July 19, 2026 | Final — leaderboard freeze |
