// Full-tournament resync: re-fetches all matches (group stage + KO rounds) from ESPN
// and force-writes correct data to Firestore. Always recalculates the leaderboard,
// even when no match data changes are needed.
// Run via: node scripts/resync-scores.mjs
// Or trigger the "Resync Scores" GitHub Actions workflow.

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixtures = JSON.parse(
  readFileSync(path.join(__dirname, '../src/data/fixtures.json'), 'utf8')
)

const SA = process.env.FIREBASE_SERVICE_ACCOUNT
if (!SA) {
  console.log('Missing FIREBASE_SERVICE_ACCOUNT — skipping.')
  process.exit(0)
}

initializeApp({ credential: cert(JSON.parse(SA)) })
const db = getFirestore()

console.log(`\n=== resync-scores ${new Date().toISOString().slice(0, 10)} ===`)

const ESPN_TO_ID = {
  'sau': 'KSA',
  'cgo': 'COD',
  'drc': 'COD',
  'ivc': 'CIV',
  'cvd': 'CPV',
}

function espnToId(abbr) {
  if (!abbr) return 'TBD'
  const lower = abbr.toLowerCase()
  if (lower === 'tbd' || lower === '') return 'TBD'
  return ESPN_TO_ID[lower] ?? abbr.toUpperCase()
}

function mapEspnStatus(statusType) {
  const completed = statusType?.completed
  const state     = statusType?.state
  if (completed)        return 'FINISHED'
  if (state === 'in')   return 'LIVE'
  if (state === 'post') return 'POSTPONED'
  return 'SCHEDULED'
}

function calcPoints(pred, match) {
  const ah = match.homeScore, aa = match.awayScore
  if (ah === null || aa === null) return 0
  const ph = pred.predictedHomeScore, pa = pred.predictedAwayScore
  const exact = ph === ah && pa === aa
  const out = x => x[0] > x[1] ? 'H' : x[1] > x[0] ? 'A' : 'D'
  const correct = out([ph, pa]) === out([ah, aa])
  if (exact)   return out([ah, aa]) === 'D' ? 2 : 5
  if (correct) return out([ah, aa]) === 'D' ? 1 : 3
  return 0
}

// Build team-pair map from GROUP fixtures in fixtures.json (canonical — immune to kickoff
// collision bugs). KO fixtures start as TBD so we look those up by kickoff time in Firestore.
const groupFixtures = fixtures.filter(m => m.round === 'GROUP')
const byTeamPair = Object.fromEntries(
  groupFixtures.map(m => [`${m.homeTeamId}:${m.awayTeamId}`, m])
)

// Load Firestore matches: needed for KO match lookup by kickoff time (teams start as TBD)
const matchSnap = await db.collection('matches').get()
const fsMatchList = matchSnap.docs.map(d => ({ id: d.id, ...d.data() }))
const byKickoff = Object.fromEntries(
  fsMatchList
    .filter(m => m.scheduledKickoffUtc)
    .map(m => [m.scheduledKickoffUtc.slice(0, 16), m])
)

// Fetch all tournament dates from ESPN (group stage + all KO rounds)
const ALL_DATES = [
  // Group stage: June 11–28
  '20260611', '20260612', '20260613', '20260614', '20260615', '20260616',
  '20260617', '20260618', '20260619', '20260620', '20260621', '20260622',
  '20260623', '20260624', '20260625', '20260626', '20260627', '20260628',
  // Round of 32: June 29 – July 5
  '20260629', '20260630', '20260701', '20260702', '20260703', '20260704', '20260705',
  // Round of 16: July 9–12
  '20260709', '20260710', '20260711', '20260712',
  // Quarter-finals: July 15–16
  '20260715', '20260716',
  // Semi-finals: July 19, 22
  '20260719', '20260722',
  // Final: July 26
  '20260726',
]

const allEvents = []
for (const date of ALL_DATES) {
  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${date}`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } }
  )
  if (!res.ok) { console.error(`ESPN ${date}: ${res.status}`); continue }
  const events = (await res.json()).events ?? []
  if (events.length) console.log(`ESPN ${date}: ${events.length} event(s)`)
  allEvents.push(...events)
}

const updates = []
const seen = new Set()

for (const event of allEvents) {
  const comp = event.competitions?.[0]
  if (!comp) continue
  const homeComp = comp.competitors?.find(c => c.homeAway === 'home')
  const awayComp = comp.competitors?.find(c => c.homeAway === 'away')
  if (!homeComp || !awayComp) continue

  const hId = espnToId(homeComp.team.abbreviation)
  const aId = espnToId(awayComp.team.abbreviation)

  // Primary: team pair (GROUP matches from fixtures.json — reliable)
  // Fallback: kickoff time (KO matches where fixture.json has TBD slots)
  const kickoffKey = event.date?.slice(0, 16)
  const fixture = byTeamPair[`${hId}:${aId}`] ?? byKickoff[kickoffKey]
  if (!fixture) { console.log(`  ⚠ unmatched: ${hId} vs ${aId} @ ${kickoffKey}`); continue }
  if (seen.has(fixture.id)) continue  // deduplicate (ESPN may return same match on adjacent dates)
  seen.add(fixture.id)

  const statusType = comp.status?.type
  const newStatus  = mapEspnStatus(statusType)
  if (newStatus === 'SCHEDULED') continue  // nothing to write yet

  const parseScore = s => { const n = parseInt(s, 10); return isNaN(n) ? null : n }
  const newHome = parseScore(homeComp.score)
  const newAway = parseScore(awayComp.score)

  // For KO matches: resolve TBD slots using ESPN's confirmed team IDs
  const resolvedHomeId = (fixture.homeTeamId === 'TBD' && hId !== 'TBD') ? hId : fixture.homeTeamId
  const resolvedAwayId = (fixture.awayTeamId === 'TBD' && aId !== 'TBD') ? aId : fixture.awayTeamId

  let winnerId = null
  if (newStatus === 'FINISHED') {
    if (homeComp.winner === true)       winnerId = resolvedHomeId
    else if (awayComp.winner === true)  winnerId = resolvedAwayId
    else if (newHome != null && newAway != null) {
      if (newHome > newAway)      winnerId = resolvedHomeId
      else if (newAway > newHome) winnerId = resolvedAwayId
    }
  }

  const round = fixture.round ?? 'UNKNOWN'
  console.log(`  ${fixture.id} [${round}] ${resolvedHomeId} ${newHome ?? '?'}-${newAway ?? '?'} ${resolvedAwayId} [${newStatus}]${winnerId ? ` winner=${winnerId}` : ''}`)
  updates.push({
    id: fixture.id,
    homeTeamId: resolvedHomeId,
    awayTeamId: resolvedAwayId,
    status: newStatus,
    homeScore: newHome,
    awayScore: newAway,
    winnerTeamId: winnerId,
    lastUpdated: new Date().toISOString(),
  })
}

if (updates.length === 0) {
  console.log('No match updates needed — proceeding to leaderboard recalculation.')
} else {
  // Write match corrections in batches
  for (let i = 0; i < updates.length; i += 400) {
    const batch = db.batch()
    for (const { id, ...fields } of updates.slice(i, i + 400)) {
      batch.update(db.collection('matches').doc(id), fields)
    }
    await batch.commit()
  }
  console.log(`Wrote ${updates.length} match corrections.`)
}

// ─── Recalculate leaderboard ───────────────────────────────────────────────
console.log('Recalculating leaderboard...')

const [finSnap, liveSnap, predSnap, userSnap, picksSnap, currentLbSnap] = await Promise.all([
  db.collection('matches').where('status', '==', 'FINISHED').get(),
  db.collection('matches').where('status', '==', 'LIVE').get(),
  db.collection('predictions').get(),
  db.collection('users').get(),
  db.collection('picks').get(),
  db.collection('leaderboard').get(),
])

const finMap       = Object.fromEntries(finSnap.docs.map(d => [d.id, d.data()]))
const liveMap      = Object.fromEntries(liveSnap.docs.map(d => [d.id, d.data()]))
const scoreableMap = { ...finMap, ...liveMap }
const userInfo     = Object.fromEntries(userSnap.docs.map(d => [d.id, d.data()]))
const preds        = predSnap.docs.map(d => ({ id: d.id, ...d.data() }))
const currentRankMap = Object.fromEntries(currentLbSnap.docs.map(d => [d.id, d.data().rank ?? null]))

const statsClean = {}
const pointRows  = []

for (const pred of preds) {
  const match = scoreableMap[pred.matchId]
  if (!match) continue
  const pts = calcPoints(pred, match)
  if (finMap[pred.matchId]) pointRows.push({ id: pred.id, pts })
  if (!statsClean[pred.userId]) statsClean[pred.userId] = {
    totalPoints: 0, exactScoreCount: 0, correctOutcomeCount: 0, correctDrawCount: 0, predictionsSubmitted: 0,
  }
  const s = statsClean[pred.userId]
  s.totalPoints += pts
  s.predictionsSubmitted++
  if (pts === 5 || pts === 2) s.exactScoreCount++
  if (pts > 0) s.correctOutcomeCount++
  if (pts === 1 || pts === 2) s.correctDrawCount++
}

for (let i = 0; i < pointRows.length; i += 400) {
  const b = db.batch()
  for (const { id, pts } of pointRows.slice(i, i + 400)) {
    b.update(db.collection('predictions').doc(id), { pointsAwarded: pts })
  }
  await b.commit()
}

const WINNER_BONUS = 10
const finalMatch = finSnap.docs.map(d => d.data()).find(m => m.round === 'FINAL' && m.winnerTeamId)
const tournamentWinnerId = finalMatch?.winnerTeamId ?? null
const picks = picksSnap.docs.map(d => ({ id: d.id, ...d.data() }))

if (tournamentWinnerId) {
  const bonusBatch = db.batch()
  for (const pick of picks) {
    const bonus = pick.teamId === tournamentWinnerId ? WINNER_BONUS : 0
    bonusBatch.set(db.collection('picks').doc(pick.id), { bonusPoints: bonus }, { merge: true })
    if (bonus > 0) {
      if (!statsClean[pick.userId]) statsClean[pick.userId] = {
        totalPoints: 0, exactScoreCount: 0, correctOutcomeCount: 0, correctDrawCount: 0, predictionsSubmitted: 0,
      }
      statsClean[pick.userId].totalPoints += bonus
    }
  }
  await bonusBatch.commit()
}

const sorted = Object.entries(statsClean).sort(([, a], [, b]) => {
  if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints
  if (b.exactScoreCount !== a.exactScoreCount) return b.exactScoreCount - a.exactScoreCount
  return b.correctOutcomeCount - a.correctOutcomeCount
})

const nowIso  = new Date().toISOString()
const lbBatch = db.batch()
let rank = 1
for (const [uid, s] of sorted) {
  lbBatch.set(db.collection('leaderboard').doc(uid), {
    uid,
    displayName:  userInfo[uid]?.displayName ?? uid,
    photoURL:     userInfo[uid]?.photoURL    ?? null,
    previousRank: currentRankMap[uid] ?? null,
    rank, lastCalculated: nowIso, ...s,
  })
  lbBatch.update(db.collection('users').doc(uid), {
    totalPoints:          s.totalPoints,
    rank,
    exactScoreCount:      s.exactScoreCount,
    correctOutcomeCount:  s.correctOutcomeCount,
    predictionsSubmitted: s.predictionsSubmitted,
  })
  rank++
}
await lbBatch.commit()
console.log(`Leaderboard updated — ${sorted.length} users, ${pointRows.length} predictions scored.`)
console.log('Resync complete.')
