# Scoring Rules

## Basic Rules

| Prediction | Points |
|---|---|
| Wrong result (predicted wrong winner or wrong draw/win) | 0 |
| Correct draw result (predicted draw, match was draw) | 1 |
| Correct draw + exact score | 2 |
| Correct winner (predicted correct winning team) | 3 |
| Correct winner + exact score | 5 |
| No prediction submitted | 0 |

**Note:** Exact score automatically implies correct outcome, so scores are not additive — the highest applicable tier is awarded.

## Point Tier Logic

```
if prediction is missing:
    points = 0

else if predicted score matches actual score exactly:
    if actual match is a draw:
        points = 2  (exact draw)
    else:
        points = 5  (exact winner + exact score)

else if predicted outcome matches actual outcome:
    if actual match is a draw:
        points = 1  (correct draw, wrong exact score)
    else:
        points = 3  (correct winner, wrong exact score)

else:
    points = 0
```

### Outcome Definition

- Draw: home score == away score
- Home win: home score > away score
- Away win: away score > home score

Predicted outcome is determined by applying the same logic to `predictedHomeScore` vs `predictedAwayScore`.

## Examples

| Actual | Prediction | Points | Reason |
|---|---|---|---|
| 2–1 | 2–1 | 5 | Exact score + correct winner |
| 2–1 | 3–0 | 3 | Correct winner (home), wrong score |
| 2–1 | 1–2 | 0 | Wrong winner |
| 1–1 | 1–1 | 2 | Exact draw score |
| 1–1 | 0–0 | 1 | Correct draw, wrong score |
| 1–1 | 2–0 | 0 | Predicted home win, actual draw |
| 0–0 | 0–0 | 2 | Exact draw score |
| 3–2 | — | 0 | No prediction submitted |

## Knockout Match Scoring

Knockout matches may go to extra time or penalties. The score used for prediction evaluation is configurable via `appConfig.useOfficialFullTimeScore`.

| Setting | Score used |
|---|---|
| `useOfficialFullTimeScore: true` (default) | Score at end of 90 minutes (full time, excluding extra time and penalties) |
| `useOfficialFullTimeScore: false` | Final score including extra time but NOT penalties (match winner may differ from 90-min score) |

**Default:** Full-time 90-minute score. Penalties and extra-time goals are ignored for scoring purposes. This is consistent with most prediction games and avoids ambiguity.

Rationale: predicting "who wins on penalties" is essentially a coin flip and not a skill-based prediction.

## Prediction Eligibility

- Prediction must be submitted before match `scheduledKickoffUtc`
- Predictions submitted after kickoff are rejected by Firestore Rules (not just the UI)
- Admin can create manual predictions for users for matches that have already finished (flagged as `isManualEntry: true`)
- Manual entries are tracked in `adminAuditLog`

## Leaderboard Tiebreakers

When two or more users have equal total points, ranking is determined by:

1. **Most exact scores** — count of predictions where `pointsAwarded >= 2` (either 2 or 5)
2. **Most correct outcomes** — count of predictions where `pointsAwarded > 0`
3. **Most predictions submitted** — count of non-null predictions
4. **Earliest cumulative submission time** — sum of `submittedAt` timestamps; lower is better (submitted earlier overall)

If all four tiebreakers are equal, users share the same rank.

## Recalculation

Scores are recalculated by admin after entering match results. The recalculation:

1. Reads all predictions for the finished match
2. Applies scoring logic above
3. Writes `pointsAwarded` to each prediction document
4. Aggregates per-user totals (total points, exact score count, correct outcome count)
5. Writes updated totals to `users/{uid}` and `leaderboard/{uid}`
6. Logs recalculation event in `adminAuditLog`

Recalculation is idempotent — safe to run multiple times for the same match.

## Edge Cases

| Case | Handling |
|---|---|
| Match postponed | Predictions remain unlocked until new kickoff time is set |
| Match abandoned (no result) | No points awarded; `status: ABANDONED` |
| Admin corrects a result | Recalculate triggered again; old pointsAwarded overwritten |
| User predicted 0–0 and actual is 0–0 | 2 points (exact draw) |
| Penalty shootout 1–1 after 90 min | Only 90-min score (1–1) used by default |
