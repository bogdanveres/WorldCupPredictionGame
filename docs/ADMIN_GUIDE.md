# Admin Guide

## Admin Access

Admin mode is granted to users whose Google account email matches an entry in `VITE_ADMIN_EMAILS` (comma-separated in `.env.local`).

```env
VITE_ADMIN_EMAILS=bogdan@example.com,co-admin@example.com
```

The admin check happens client-side after Firebase Auth login. Firestore Rules provide server-side enforcement as a second layer.

Admin panel is at `/admin`. Non-admin users who navigate there see an "Access Denied" message.

## Admin Panel Sections

### 1. Match Management

**Update a match result:**

1. Go to Admin → Matches
2. Find the match (filter by date/group/round)
3. Click "Edit Result"
4. Enter `homeScore` and `awayScore`
5. Set status to `FINISHED`
6. Click Save

The admin write goes directly to Firestore `matches/{matchId}`. All users see updated scores immediately.

**Mark a match as LIVE:**

1. Find the match
2. Click "Set Live"
3. Status updates to `LIVE` in Firestore
4. Frontend clients begin polling for updates

**Postpone a match:**

1. Find the match
2. Click "Postpone"
3. Optionally enter new kickoff time
4. Status updates to `POSTPONED`
5. Predictions remain unlocked until new kickoff time is confirmed

### 2. Team Import/Update

**Import from JSON file:**

1. Go to Admin → Teams
2. Click "Import JSON"
3. Paste or upload `teams.json`
4. Preview changes
5. Click "Confirm Import"

Batch-writes all team documents to Firestore `teams/` collection. Existing teams are overwritten.

**Manual team edit:**

1. Find team in list
2. Click "Edit"
3. Update fields (name, group, flag, etc.)
4. Save

### 3. Fixture Import/Update

**Import fixtures from JSON:**

1. Go to Admin → Fixtures
2. Click "Import JSON"
3. Paste `fixtures.json`
4. Preview
5. Confirm

All 104 match documents are written to Firestore `matches/`. Existing documents are overwritten (use with care — wipes manual score updates if present).

**Safe re-import:** Keeps existing `homeScore`, `awayScore`, `status` if present by merging, not replacing.

### 4. Manual Prediction Entry

Use when a user made a prediction outside the app (e.g., via WhatsApp message before the match) and the admin wants to honor it.

1. Go to Admin → Manual Predictions
2. Click "New Manual Entry"
3. Select user from dropdown
4. Select match
5. Enter predicted home and away score
6. Enter reason (required — stored in `manualEntries` collection)
7. Click Save

The prediction is written to `predictions/{userId}_{matchId}` with:
```json
{
  "isManualEntry": true,
  "manuallyEnteredByAdmin": "<adminUid>"
}
```

Also writes a record to `manualEntries/` collection and `adminAuditLog/`.

Manual entries can be made for matches that have already finished. Scoring is calculated the same way as normal predictions.

### 5. Recalculate Leaderboard

Run after entering match results.

1. Go to Admin → Recalculate
2. Optionally select specific matches or "All finished matches"
3. Click "Recalculate"
4. Watch progress log

What happens:
1. Reads all predictions for selected finished matches
2. Applies scoring rules (see `SCORING_RULES.md`)
3. Writes `pointsAwarded` to each prediction
4. Aggregates per-user totals
5. Writes to `users/{uid}` and `leaderboard/{uid}`
6. Updates `appConfig.lastLeaderboardUpdate`
7. Logs to `adminAuditLog`

Duration: ~30 seconds for 50 users × 104 matches = 5,200 predictions.

### 6. Missing Predictions Inspector

Shows which users have not submitted predictions for upcoming or recent matches.

1. Go to Admin → Missing Predictions
2. Filter by match or user
3. View table: user × match grid with prediction status
4. Optionally enter manual predictions directly from this view

Useful before a match starts to remind users or enter manual predictions.

### 7. Export Data

**Export predictions as CSV:**

1. Admin → Export → Predictions CSV
2. Select date range or all
3. Download CSV with columns: userId, displayName, matchId, predictedHomeScore, predictedAwayScore, pointsAwarded, isManualEntry

**Export predictions as JSON:**

Same as above, JSON format. Useful for backup or migration.

**Export leaderboard as CSV:**

Snapshot of current leaderboard with all columns.

## How to Correct a Result

If an incorrect result was entered:

1. Edit the match result (see Match Management)
2. Run Recalculate for that match
3. All affected predictions are rescored automatically

## Audit Log

Every admin action is logged in `adminAuditLog/` with:
- `adminUid` — who made the change
- `action` — what was done
- `before` — document state before change
- `after` — document state after change
- `timestamp`

View audit log: Admin → Audit Log. Filter by admin, action type, or date range.

## Firestore Rules Summary for Admins

Admins are identified by Firestore Rules via custom claims OR by checking `appConfig.adminEmails`.

MVP approach (simpler): check email against `appConfig.adminEmails` array in rules:

```javascript
function isAdmin() {
  return request.auth != null &&
    request.auth.token.email in get(/databases/$(database)/documents/appConfig/main).data.adminEmails;
}
```

Better approach (recommended if >2 admins): use Firebase custom claims set via Firebase Admin SDK or a one-time Cloud Function.

## Common Admin Tasks During Tournament

### Before each matchday:
- Verify fixture kickoff times are correct in Firestore
- Check missing predictions report

### When a match starts:
- Optionally set status to LIVE manually (or let API do it if using API provider)
- Monitor live scores if manually maintaining

### After a match ends:
- Enter final score in Admin → Matches
- Run Recalculate
- Verify leaderboard updated correctly

### If user reports missing prediction:
- Check audit log for any prior manual entries
- Add manual entry with reason documented
- Recalculate

### End of group stage:
- Verify all 48 group matches have results
- Run full recalculate
- Update group standings if not calculated automatically
- Verify knockout bracket populated correctly
