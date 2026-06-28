// One-shot admin script: upsert a prediction on behalf of a user and recalculate their score.
// Usage: FIREBASE_SERVICE_ACCOUNT='...' node scripts/manual-prediction.mjs
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

const SA = process.env.FIREBASE_SERVICE_ACCOUNT
if (!SA) { console.error('Missing FIREBASE_SERVICE_ACCOUNT'); process.exit(1) }

initializeApp({ credential: cert(JSON.parse(SA)) })
const db   = getFirestore()
const auth = getAuth()

// ── Parameters ──────────────────────────────────────────────────────────────
const TARGET_EMAIL    = 'andreeavedean@gmail.com'
const MATCH_ID        = 'm073'   // RSA vs CAN
const PREDICTED_HOME  = 2        // RSA
const PREDICTED_AWAY  = 1        // CAN

// ── Scoring logic (mirrors update-scores.mjs) ────────────────────────────────
function calcPoints(pred, match) {
  const ah = match.homeScore, aa = match.awayScore
  if (ah === null || aa === null) return 0
  const ph = pred.predictedHomeScore, pa = pred.predictedAwayScore
  const out = x => x[0] > x[1] ? 'H' : x[1] > x[0] ? 'A' : 'D'
  const exact   = ph === ah && pa === aa
  const correct = out([ph, pa]) === out([ah, aa])
  if (exact)   return out([ah, aa]) === 'D' ? 2 : 5
  if (correct) return out([ah, aa]) === 'D' ? 1 : 3
  return 0
}

// ── 1. Resolve user ──────────────────────────────────────────────────────────
const userRecord = await auth.getUserByEmail(TARGET_EMAIL)
const uid = userRecord.uid
console.log(`User: ${userRecord.displayName ?? TARGET_EMAIL} (uid: ${uid})`)

// ── 2. Fetch the match ───────────────────────────────────────────────────────
const matchDoc = await db.collection('matches').doc(MATCH_ID).get()
if (!matchDoc.exists) { console.error(`Match ${MATCH_ID} not found`); process.exit(1) }
const match = matchDoc.data()
console.log(`Match: ${match.homeTeamId} ${match.homeScore ?? '?'}-${match.awayScore ?? '?'} ${match.awayTeamId} [${match.status}]`)

// ── 3. Upsert the prediction ─────────────────────────────────────────────────
const predId  = `${uid}_${MATCH_ID}`
const predRef = db.collection('predictions').doc(predId)
const existing = await predRef.get()
const now      = new Date().toISOString()

const pts = calcPoints({ predictedHomeScore: PREDICTED_HOME, predictedAwayScore: PREDICTED_AWAY }, match)

if (existing.exists) {
  await predRef.set({
    predictedHomeScore: PREDICTED_HOME,
    predictedAwayScore: PREDICTED_AWAY,
    pointsAwarded: pts,
    updatedAt: now,
    isManualEntry: true,
    manuallyEnteredByAdmin: 'admin-script',
  }, { merge: true })
  console.log(`Updated existing prediction → ${PREDICTED_HOME}-${PREDICTED_AWAY} (${pts} pts)`)
} else {
  await predRef.set({
    id: predId,
    userId: uid,
    matchId: MATCH_ID,
    predictedHomeScore: PREDICTED_HOME,
    predictedAwayScore: PREDICTED_AWAY,
    pointsAwarded: pts,
    submittedAt: now,
    updatedAt: now,
    lockedAt: null,
    isManualEntry: true,
    manuallyEnteredByAdmin: 'admin-script',
  })
  console.log(`Created new prediction → ${PREDICTED_HOME}-${PREDICTED_AWAY} (${pts} pts)`)
}

// ── 4. Recalculate this user's leaderboard totals ────────────────────────────
const [finSnap, liveSnap, predSnap, picksSnap, currentLbSnap] = await Promise.all([
  db.collection('matches').where('status', '==', 'FINISHED').get(),
  db.collection('matches').where('status', '==', 'LIVE').get(),
  db.collection('predictions').where('userId', '==', uid).get(),
  db.collection('picks').where('userId', '==', uid).get(),
  db.collection('leaderboard').doc(uid).get(),
])

const finMap       = Object.fromEntries(finSnap.docs.map(d => [d.id, d.data()]))
const liveMap      = Object.fromEntries(liveSnap.docs.map(d => [d.id, d.data()]))
const scoreableMap = { ...finMap, ...liveMap }

let totalPoints = 0, exactScoreCount = 0, correctOutcomeCount = 0, correctDrawCount = 0, predictionsSubmitted = 0
const pointRows = []

for (const d of predSnap.docs) {
  const pred  = d.data()
  const m     = scoreableMap[pred.matchId]
  if (!m) continue
  const p = calcPoints(pred, m)
  if (finMap[pred.matchId]) pointRows.push({ id: d.id, pts: p })
  totalPoints += p
  predictionsSubmitted++
  if (p === 5 || p === 2) exactScoreCount++
  if (p > 0) correctOutcomeCount++
  if (p === 1 || p === 2) correctDrawCount++
}

// Winner bonus
const finalMatch = finSnap.docs.map(d => d.data()).find(m => m.round === 'FINAL' && m.winnerTeamId)
const winnerId   = finalMatch?.winnerTeamId ?? null
for (const d of picksSnap.docs) {
  if (winnerId && d.data().teamId === winnerId) totalPoints += 10
}

// Write back pointsAwarded on all this user's prediction docs
const batch = db.batch()
for (const { id, pts: p } of pointRows) {
  batch.update(db.collection('predictions').doc(id), { pointsAwarded: p })
}

// Update leaderboard row (keep rank/displayName from current entry)
const lbData = currentLbSnap.exists ? currentLbSnap.data() : {}
batch.set(db.collection('leaderboard').doc(uid), {
  ...lbData,
  uid,
  totalPoints,
  exactScoreCount,
  correctOutcomeCount,
  correctDrawCount,
  predictionsSubmitted,
  lastCalculated: now,
}, { merge: true })

// Update user doc totals
batch.update(db.collection('users').doc(uid), {
  totalPoints, exactScoreCount, correctOutcomeCount, predictionsSubmitted,
})

await batch.commit()
console.log(`Leaderboard updated: ${totalPoints} pts total, ${predictionsSubmitted} predictions, ${exactScoreCount} exact.`)
console.log('Done.')
