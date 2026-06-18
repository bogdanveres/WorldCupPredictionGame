import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const API_KEY = process.env.API_FOOTBALL_KEY
const SA     = process.env.FIREBASE_SERVICE_ACCOUNT

if (!API_KEY || !SA) {
  console.log('Missing API_FOOTBALL_KEY or FIREBASE_SERVICE_ACCOUNT — skipping.')
  process.exit(0)
}

initializeApp({ credential: cert(JSON.parse(SA)) })
const db = getFirestore()

// ─── Team name normalisation ───────────────────────────────────────────────
// API-Football uses different names for some national teams.
const ALIASES = {
  'korea republic':              'KOR',
  'south korea':                 'KOR',
  'czechia':                     'CZE',
  'czech republic':              'CZE',
  "cote d'ivoire":               'CIV',
  'ivory coast':                 'CIV',
  'cabo verde':                  'CPV',
  'cape verde':                  'CPV',
  'curacao':                     'CUW',
  'saudi arabia':                'KSA',
  'new zealand':                 'NZL',
  'dr congo':                    'COD',
  'democratic republic of congo':'COD',
  'united states':               'USA',
  'bosnia & herzegovina':        'BIH',
  'bosnia and herzegovina':      'BIH',
  'netherlands':                 'NED',
  'holland':                     'NED',
}

function norm(name) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function resolveTeamId(apiName, teamNameById) {
  const n = norm(apiName)
  if (ALIASES[n]) return ALIASES[n]
  for (const [id, name] of Object.entries(teamNameById)) {
    if (norm(name) === n) return id
  }
  return null
}

// ─── Status mapping ────────────────────────────────────────────────────────
function mapStatus(short) {
  if (['1H','HT','2H','ET','BT','P','SUSP','INT'].includes(short)) return 'LIVE'
  if (['FT','AET','PEN'].includes(short))                           return 'FINISHED'
  if (short === 'PST')                                              return 'POSTPONED'
  if (['CANC','ABD','AWD','WO'].includes(short))                    return 'ABANDONED'
  return 'SCHEDULED'
}

// ─── Scoring logic (mirrors src/utils/scoring.ts) ─────────────────────────
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

const now  = Date.now()
const today = new Date().toISOString().slice(0, 10)
console.log(`\n=== update-scores ${today} ===`)

// ─── Pre-flight: load matches and check if any are active ─────────────────
// A match is active if it is LIVE, or its kickoff is within [-5min, +150min].
// 150 min covers 90 min game + halftime + extra time + penalties + buffer.
// This avoids spending API credits when no matches are in progress.
const BEFORE_MS = 5   * 60 * 1000
const AFTER_MS  = 150 * 60 * 1000

const [matchSnap, teamSnap] = await Promise.all([
  db.collection('matches').get(),
  db.collection('teams').get(),
])

const teamNameById = Object.fromEntries(teamSnap.docs.map(d => [d.id, d.data().name]))
const fsMatches    = matchSnap.docs.map(d => ({ id: d.id, ...d.data() }))

const activeMatches = fsMatches.filter(m => {
  if (m.status === 'LIVE') return true
  if (m.status !== 'SCHEDULED' || !m.scheduledKickoffUtc) return false
  const kickoff = new Date(m.scheduledKickoffUtc).getTime()
  return now >= kickoff - BEFORE_MS && now <= kickoff + AFTER_MS
})

if (activeMatches.length === 0) {
  console.log('No active matches — skipping API call.')
  process.exit(0)
}

console.log(`Active matches: ${activeMatches.map(m => m.id).join(', ')}`)

// ─── Fetch today's fixtures from API-Football ─────────────────────────────
const apiRes = await fetch(
  `https://v3.football.api-sports.io/fixtures?league=1&season=2026&date=${today}`,
  { headers: { 'x-apisports-key': API_KEY } }
)

if (!apiRes.ok) {
  console.error(`API-Football error: ${apiRes.status} ${await apiRes.text()}`)
  process.exit(1)
}

const remaining = apiRes.headers.get('x-ratelimit-requests-remaining')
const apiFix = (await apiRes.json()).response ?? []
console.log(`API-Football: ${apiFix.length} fixtures today | ${remaining} requests remaining`)

if (apiFix.length === 0) {
  console.log('No fixtures from API today.')
  process.exit(0)
}

// Index by kickoff minute (YYYY-MM-DDTHH:MM)
const byKickoff = Object.fromEntries(
  fsMatches.map(m => [m.scheduledKickoffUtc?.slice(0, 16), m])
)

// ─── Match API fixtures → Firestore matches ────────────────────────────────
const updates   = []
const newlyDone = []

for (const fix of apiFix) {
  const apiKey = new Date(fix.fixture.date).toISOString().slice(0, 16)
  let fsMatch  = byKickoff[apiKey]

  if (!fsMatch) {
    const hId = resolveTeamId(fix.teams.home.name, teamNameById)
    const aId = resolveTeamId(fix.teams.away.name, teamNameById)
    if (hId && aId) fsMatch = fsMatches.find(m => m.homeTeamId === hId && m.awayTeamId === aId)
  }

  if (!fsMatch) {
    console.log(`  ⚠ unmatched: ${fix.teams.home.name} vs ${fix.teams.away.name} @ ${apiKey}`)
    continue
  }

  const newStatus = mapStatus(fix.fixture.status.short)
  const newHome   = fix.goals.home   ?? null
  const newAway   = fix.goals.away   ?? null

  const changed =
    fsMatch.status    !== newStatus ||
    fsMatch.homeScore !== newHome   ||
    fsMatch.awayScore !== newAway

  if (!changed) continue

  let winnerId = null
  if (newStatus === 'FINISHED' && newHome !== null && newAway !== null) {
    if (newHome > newAway) winnerId = fsMatch.homeTeamId
    else if (newAway > newHome) winnerId = fsMatch.awayTeamId
  }

  console.log(`  ${fsMatch.id} ${fix.teams.home.name} ${newHome ?? '?'}-${newAway ?? '?'} ${fix.teams.away.name} [${newStatus}]`)

  updates.push({ id: fsMatch.id, status: newStatus, homeScore: newHome, awayScore: newAway, winnerTeamId: winnerId, lastUpdated: new Date().toISOString() })

  if (fsMatch.status !== 'FINISHED' && newStatus === 'FINISHED') {
    newlyDone.push({ ...fsMatch, status: newStatus, homeScore: newHome, awayScore: newAway, winnerTeamId: winnerId })
  }
}

if (updates.length === 0) {
  console.log('No changes.')
  process.exit(0)
}

// ─── Write match updates ───────────────────────────────────────────────────
const matchBatch = db.batch()
for (const u of updates) {
  const { id, ...fields } = u
  matchBatch.update(db.collection('matches').doc(id), fields)
}
await matchBatch.commit()
console.log(`Wrote ${updates.length} match update(s).`)

if (newlyDone.length === 0) {
  console.log('No newly finished matches — skipping leaderboard recalc.')
  process.exit(0)
}

// ─── Recalculate leaderboard ───────────────────────────────────────────────
console.log(`${newlyDone.length} newly finished — recalculating leaderboard...`)

const [finSnap, predSnap, userSnap] = await Promise.all([
  db.collection('matches').where('status', '==', 'FINISHED').get(),
  db.collection('predictions').get(),
  db.collection('users').get(),
])

const finMap   = Object.fromEntries(finSnap.docs.map(d => [d.id, d.data()]))
const userInfo = Object.fromEntries(userSnap.docs.map(d => [d.id, d.data()]))
const preds    = predSnap.docs.map(d => d.data())

const statsClean = {}
const pointRows  = []

for (const pred of preds) {
  const match = finMap[pred.matchId]
  if (!match) continue
  const pts = calcPoints(pred, match)
  pointRows.push({ id: pred.id, pts })
  if (!statsClean[pred.userId]) statsClean[pred.userId] = { totalPoints: 0, exactScoreCount: 0, correctOutcomeCount: 0, correctDrawCount: 0, predictionsSubmitted: 0 }
  const s = statsClean[pred.userId]
  s.totalPoints   += pts
  s.predictionsSubmitted++
  if (pts === 5 || pts === 2) s.exactScoreCount++
  if (pts > 0) s.correctOutcomeCount++
  if (pts === 1 || pts === 2) s.correctDrawCount++
}

// Write prediction pointsAwarded in batches of 400
for (let i = 0; i < pointRows.length; i += 400) {
  const b = db.batch()
  for (const { id, pts } of pointRows.slice(i, i + 400)) {
    b.update(db.collection('predictions').doc(id), { pointsAwarded: pts })
  }
  await b.commit()
}

// Write leaderboard + user totals
const sorted = Object.entries(statsClean).sort(([, a], [, b]) => {
  if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints
  if (b.exactScoreCount !== a.exactScoreCount) return b.exactScoreCount - a.exactScoreCount
  return b.correctOutcomeCount - a.correctOutcomeCount
})

const nowIso = new Date().toISOString()
const lbBatch = db.batch()
let rank = 1
for (const [uid, s] of sorted) {
  lbBatch.set(db.collection('leaderboard').doc(uid), {
    uid,
    displayName: userInfo[uid]?.displayName ?? uid,
    photoURL:    userInfo[uid]?.photoURL    ?? null,
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
