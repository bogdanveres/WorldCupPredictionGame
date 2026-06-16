# API Source Strategy

## Decision Framework

The app uses a DataProvider interface so the data source can be swapped without touching UI code. The active provider is selected by `VITE_DATA_PROVIDER` environment variable.

```
VITE_DATA_PROVIDER=local    → LocalJsonProvider (default, no API key needed)
VITE_DATA_PROVIDER=api      → ApiProvider (requires API key + CORS proxy or native support)
VITE_DATA_PROVIDER=firestore → FirestoreProvider (admin-maintained, always used for results)
```

Regardless of provider, **Firestore match documents always override schedule data** for scores and status. The external API or local JSON only provides fixtures and team info.

## Provider Interface

```typescript
interface DataProvider {
  getTeams(): Promise<Team[]>;
  getMatches(filters?: MatchFilter): Promise<Match[]>;
  getMatch(id: string): Promise<Match>;
  getLiveMatches(): Promise<Match[]>;
  getStandings(group?: string): Promise<Standing[]>;
}

interface MatchFilter {
  round?: MatchRound;
  group?: string;
  status?: MatchStatus;
  teamId?: string;
  dateFrom?: string;
  dateTo?: string;
}
```

## Option 1: Local JSON (Default / Fallback)

**Files:** `src/data/teams.json`, `src/data/fixtures.json`

**When to use:**
- MVP phase before API is integrated
- API is unavailable or rate-limited
- Offline development

**Pros:** Zero cost, zero latency, works offline, no CORS issues
**Cons:** Must be manually updated; no live scores automatically

**Update process:** Admin enters results manually via Admin panel → written to Firestore → UI reads Firestore for live data

**Data format:** Same structure as TypeScript interfaces in `DATA_MODEL.md`

## Option 2: football-data.org

**URL:** https://www.football-data.org  
**Free tier:** 10 requests/minute, access to major competitions  
**World Cup 2026 support:** Expected — they covered 2022 World Cup  
**CORS:** API supports browser requests with API key in header  
**Authentication:** `X-Auth-Token` header

**Endpoints used:**
```
GET /v4/competitions/WC/teams         → team list
GET /v4/competitions/WC/matches       → all fixtures + results
GET /v4/competitions/WC/matches?status=LIVE → live matches
GET /v4/competitions/WC/standings     → group standings
```

**Integration notes:**
- Map their match IDs to our internal IDs via `externalId` field
- Their `homeScore.fullTime` / `awayScore.fullTime` maps to our `homeScore`/`awayScore`
- Their status values: `SCHEDULED`, `LIVE`, `IN_PLAY`, `PAUSED`, `FINISHED`, `SUSPENDED`, `POSTPONED`, `CANCELLED`, `TIMED`
- Map `IN_PLAY` and `PAUSED` → our `LIVE`

**Rate limit strategy:**
- Cache responses in memory for 60 seconds
- Only poll live matches when status=LIVE is detected
- Use Firestore as the authoritative source after admin confirms result

## Option 3: API-Football (RapidAPI)

**URL:** https://rapidapi.com/api-sports/api/api-football  
**Free tier:** 100 requests/day  
**World Cup 2026:** Likely supported (covered 2022)  
**CORS:** Requires RapidAPI proxy headers

100 requests/day is very low for live polling. Only viable if used for initial data import, not live polling.

## Option 4: Sportmonks

**URL:** https://www.sportmonks.com  
**Free tier:** Limited — primarily paid  
**Verdict:** Skip for this project unless free tier improves

## Option 5: OpenLigaDB / Wikipedia / Manual

For a tournament with fixed fixtures (dates/times/venues known in advance), local JSON is often the best choice. Scores can be entered manually by admin. This is a valid production approach for a small prediction game.

## Recommended Strategy

| Phase | Data Source | Live Scores |
|---|---|---|
| MVP | Local JSON | Admin manual entry |
| V1 | football-data.org API | API polling (60s interval for live matches) |
| V2 | API + Firestore fallback | Auto via API, admin override via Firestore |

## Fixture/Team JSON Maintenance

When using local JSON:

1. `src/data/teams.json` — 48 teams, updated once (squads finalized by June 2026)
2. `src/data/fixtures.json` — 104 matches, kickoff times known in advance from FIFA

Teams confirmed for World Cup 2026 (as of knowledge cutoff — verify before publishing):
- CONCACAF: 6 teams (USA, Canada, Mexico auto-qualified as hosts + 3 qualified)
- UEFA: 16 teams
- CONMEBOL: 6 teams
- CAF: 9 teams
- AFC: 8 teams
- OFC: 1 team
- Intercontinental playoffs: 2 teams

**Do not hardcode team list without verifying against FIFA official source.** Use placeholder data with clear TODO comment until qualified teams are confirmed.

## Live Match Refresh Strategy

```
On FixturesPage mount:
  startRefresh()
    while (anyMatchIsLive):
      await sleep(REFRESH_INTERVAL)   // default 60s from appConfig
      liveMatches = await provider.getLiveMatches()
      updateMatchCache(liveMatches)

On FixturesPage unmount:
  clearInterval / set flag to stop loop
```

Refresh only activates when a match is LIVE. Zero API calls when all matches are SCHEDULED or FINISHED.

## Firestore as Admin Override

After any admin result entry:
1. Match document in Firestore is updated with scores and `status: FINISHED`
2. All clients reading matches merge Firestore result over API/local data
3. Scoring recalculation triggered manually by admin

Merge logic:
```typescript
function mergeWithFirestoreOverride(
  baseMatch: Match,
  firestoreMatch: Partial<Match> | undefined
): Match {
  if (!firestoreMatch) return baseMatch;
  return {
    ...baseMatch,
    ...firestoreMatch,  // Firestore fields win
  };
}
```

## API Key Security

Firebase/Vite apps expose env vars to the browser bundle. For football-data.org, the API key is in the `X-Auth-Token` header — this is visible in browser dev tools.

Mitigation:
- football-data.org free keys have low rate limits — leaking them is low risk
- Restrict API key to your domain in the provider's dashboard if possible
- For higher-security needs: use a Firebase Cloud Function as a proxy (requires Blaze plan)

For this project (small group, zero budget), browser-exposed API key is acceptable.
