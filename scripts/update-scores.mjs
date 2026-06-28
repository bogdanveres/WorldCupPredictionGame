import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import webpush from 'web-push'

const SA = process.env.FIREBASE_SERVICE_ACCOUNT

if (!SA) {
  console.log('Missing FIREBASE_SERVICE_ACCOUNT — skipping.')
  process.exit(0)
}

initializeApp({ credential: cert(JSON.parse(SA)) })
const db = getFirestore()

// ─── Web Push (optional — skipped if VAPID keys not set) ──────────────────
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT
const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const pushEnabled = VAPID_SUBJECT && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY
if (pushEnabled) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
}

async function sendPushToAll(payload) {
  if (!pushEnabled) return
  const subsSnap = await db.collection('pushSubscriptions').get()
  const sends = subsSnap.docs.map(async d => {
    try {
      await webpush.sendNotification(d.data().subscription, JSON.stringify(payload))
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await d.ref.delete()
      }
    }
  })
  await Promise.allSettled(sends)
}

// ─── ESPN abbreviation → our team ID (only where they differ) ────────────
const ESPN_TO_ID = {
  'sau': 'KSA',  // Saudi Arabia
  'cgo': 'COD',  // DR Congo
  'drc': 'COD',  // DR Congo (alt)
  'ivc': 'CIV',  // Ivory Coast
  'cvd': 'CPV',  // Cape Verde (alt)
}

function espnToId(abbr) {
  if (!abbr) return 'TBD'
  const lower = abbr.toLowerCase()
  if (lower === 'tbd' || lower === '') return 'TBD'
  return ESPN_TO_ID[lower] ?? abbr.toUpperCase()
}

function isRealTeam(id) {
  return id && id !== 'TBD'
}

// ─── Status mapping ────────────────────────────────────────────────────────
function mapEspnStatus(statusType) {
  const state     = statusType?.state      // 'pre' | 'in' | 'post'
  const completed = statusType?.completed  // boolean
  // completed flag wins — ESPN briefly emits state='in' && completed=true at FT
  if (completed)        return 'FINISHED'
  if (state === 'in')   return 'LIVE'
  if (state === 'post') return 'POSTPONED'
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

const nowMs = Date.now()
const today = new Date().toISOString().slice(0, 10)
console.log(`\n=== update-scores ${today} ===`)

// ─── Pre-flight: load Firestore matches, find active or missed ones ────────
// Active  = LIVE, or SCHEDULED within [-5min, +150min] of kickoff.
// Missed  = SCHEDULED but kickoff was up to 7 days ago (wide window so no match
//           gets permanently stuck as SCHEDULED if the cron missed its window).
// 150 min covers 90 min + halftime + ET + penalties + buffer.
const BEFORE_MS   = 5   * 60 * 1000        //  5 min before kickoff
const AFTER_MS    = 150 * 60 * 1000        // 150 min after kickoff
const CATCH_UP_MS = 7   * 24 * 60 * 60 * 1000  //  7 day catch-up for missed windows

const [matchSnap, teamSnap] = await Promise.all([
  db.collection('matches').get(),
  db.collection('teams').get(),
])

const fsMatches = matchSnap.docs.map(d => ({ id: d.id, ...d.data() }))

const REVERIFY_MS = 48 * 60 * 60 * 1000  // re-check recently finished matches for 48h

const activeMatches = fsMatches.filter(m => {
  if (m.status === 'LIVE') return true
  if (m.status === 'FINISHED' && m.scheduledKickoffUtc) {
    // Reverify recently finished matches — catches stale-LIVE and wrong-score bugs
    const kickoff = new Date(m.scheduledKickoffUtc).getTime()
    return nowMs - kickoff <= REVERIFY_MS
  }
  if (m.status !== 'SCHEDULED' || !m.scheduledKickoffUtc) return false
  const kickoff = new Date(m.scheduledKickoffUtc).getTime()
  // Normal window OR catch-up for missed games
  return nowMs >= kickoff - BEFORE_MS && nowMs <= kickoff + AFTER_MS + CATCH_UP_MS
})

// Also scan upcoming knockout matches with TBD teams within 3 days so we
// pick up confirmed team IDs from ESPN as soon as the group stage ends.
const KO_LOOKAHEAD_MS = 3 * 24 * 60 * 60 * 1000
const tbdKoMatches = fsMatches.filter(m => {
  if (m.status !== 'SCHEDULED' || m.round === 'GROUP' || !m.scheduledKickoffUtc) return false
  if (m.homeTeamId !== 'TBD' && m.awayTeamId !== 'TBD') return false
  const kickoff = new Date(m.scheduledKickoffUtc).getTime()
  return kickoff > nowMs && kickoff <= nowMs + KO_LOOKAHEAD_MS
})

// Deduplicate by match ID
const allToProcess = [...new Map(
  [...activeMatches, ...tbdKoMatches].map(m => [m.id, m])
).values()]

if (allToProcess.length === 0) {
  console.log('No active or upcoming TBD matches — skipping API call.')
  process.exit(0)
}

// Gather unique dates to query ESPN (may span two UTC days)
const activeDates = [...new Set(allToProcess.map(m => m.scheduledKickoffUtc.slice(0, 10)))].sort()
console.log(`Processing: ${allToProcess.map(m => m.id).join(', ')} (dates: ${activeDates.join(', ')})`)

// ─── Fetch from ESPN (free, no API key) ───────────────────────────────────
const allEvents = []
for (const date of activeDates) {
  const espnRes = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${date.replace(/-/g, '')}`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } }
  )
  if (!espnRes.ok) {
    console.error(`ESPN error for ${date}: ${espnRes.status}`)
    continue
  }
  const events = (await espnRes.json()).events ?? []
  console.log(`ESPN ${date}: ${events.length} event(s)`)
  allEvents.push(...events)
}

if (allEvents.length === 0) {
  console.log('No events from ESPN.')
  process.exit(0)
}

// Index Firestore matches by kickoff minute (YYYY-MM-DDTHH:MM) — used as fallback for TBD KO matches
const byKickoff = Object.fromEntries(
  fsMatches.map(m => [m.scheduledKickoffUtc?.slice(0, 16), m])
)
// Index by team pair — primary key, immune to kickoff time errors and simultaneous-match collisions
const byTeamPair = Object.fromEntries(
  fsMatches
    .filter(m => m.homeTeamId !== 'TBD' && m.awayTeamId !== 'TBD')
    .map(m => [`${m.homeTeamId}:${m.awayTeamId}`, m])
)

// ─── Match ESPN events → Firestore matches ─────────────────────────────────
const updates = []

for (const event of allEvents) {
  const comp = event.competitions?.[0]
  if (!comp) continue

  const homeComp = comp.competitors?.find(c => c.homeAway === 'home')
  const awayComp = comp.competitors?.find(c => c.homeAway === 'away')
  if (!homeComp || !awayComp) continue

  const hId = espnToId(homeComp.team.abbreviation)
  const aId = espnToId(awayComp.team.abbreviation)

  // Primary: team pair — unique per match, works for known-team fixtures
  // Fallback: kickoff timestamp — covers TBD knockout matches before teams are confirmed
  const kickoffKey = event.date?.slice(0, 16)
  let fsMatch = (hId !== 'TBD' && aId !== 'TBD') ? byTeamPair[`${hId}:${aId}`] : null
  if (!fsMatch) fsMatch = byKickoff[kickoffKey]

  if (!fsMatch) {
    console.log(`  ⚠ unmatched: ${homeComp.team.abbreviation} vs ${awayComp.team.abbreviation} @ ${kickoffKey}`)
    continue
  }

  const statusType = comp.status?.type
  const newStatus  = mapEspnStatus(statusType)

  // Resolve team IDs: use ESPN's value when our record still has TBD
  const resolvedHomeId = (fsMatch.homeTeamId === 'TBD' && isRealTeam(hId)) ? hId : fsMatch.homeTeamId
  const resolvedAwayId = (fsMatch.awayTeamId === 'TBD' && isRealTeam(aId)) ? aId : fsMatch.awayTeamId
  const teamChanged =
    resolvedHomeId !== fsMatch.homeTeamId ||
    resolvedAwayId !== fsMatch.awayTeamId

  // Don't apply scores for pre-match events (ESPN sends "0" before kickoff)
  const parseScore = s => {
    if (newStatus === 'SCHEDULED') return null
    const n = parseInt(s, 10)
    return isNaN(n) ? null : n
  }
  const newHome = parseScore(homeComp.score)
  const newAway = parseScore(awayComp.score)

  const changed =
    fsMatch.status    !== newStatus ||
    fsMatch.homeScore !== newHome   ||
    fsMatch.awayScore !== newAway   ||
    teamChanged

  if (!changed) continue

  // Use ESPN's winner flag — correctly handles AET and penalty shootouts
  let winnerId = null
  if (newStatus === 'FINISHED') {
    if (homeComp.winner === true)       winnerId = resolvedHomeId
    else if (awayComp.winner === true)  winnerId = resolvedAwayId
    else if (newHome !== null && newAway !== null) {
      if (newHome > newAway)      winnerId = resolvedHomeId
      else if (newAway > newHome) winnerId = resolvedAwayId
    }
  }

  if (teamChanged) {
    console.log(`  ${fsMatch.id} team IDs resolved: ${resolvedHomeId} vs ${resolvedAwayId}`)
  }
  console.log(`  ${fsMatch.id} ${resolvedHomeId} ${newHome ?? '?'}-${newAway ?? '?'} ${resolvedAwayId} [${newStatus}]`)

  updates.push({
    id: fsMatch.id,
    prevStatus: fsMatch.status,
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
  console.log('No changes.')
  process.exit(0)
}

// ─── Write match updates ───────────────────────────────────────────────────
const matchBatch = db.batch()
for (const u of updates) {
  // eslint-disable-next-line no-unused-vars
  const { id, prevStatus, ...fields } = u
  // homeTeamId and awayTeamId are included — they may have been resolved from TBD
  matchBatch.update(db.collection('matches').doc(id), fields)
}
await matchBatch.commit()
console.log(`Wrote ${updates.length} match update(s).`)

// ─── Push notifications for state changes ─────────────────────────────────
// We need team names — build a quick map from the already-loaded teamSnap
const teamNameMap = Object.fromEntries(teamSnap.docs.map(d => [d.id, d.data().shortName ?? d.id]))

for (const u of updates) {
  const homeShort = teamNameMap[u.homeTeamId] ?? '?'
  const awayShort = teamNameMap[u.awayTeamId] ?? '?'

  if (u.status === 'LIVE' && u.prevStatus === 'SCHEDULED') {
    await sendPushToAll({
      title: '⚽ Match Starting',
      body: `${homeShort} vs ${awayShort} — make your prediction!`,
      tag: `live-${u.id}`,
      url: '/WorldCupPredictionGame/',
    })
  } else if (u.status === 'FINISHED' && u.prevStatus !== 'FINISHED') {
    const score = u.homeScore !== null ? `${u.homeScore}–${u.awayScore}` : ''
    await sendPushToAll({
      title: '🏁 Full Time',
      body: `${homeShort} ${score} ${awayShort}`,
      tag: `ft-${u.id}`,
      url: '/WorldCupPredictionGame/',
    })
  }
}

// ─── Recalculate leaderboard ───────────────────────────────────────────────
// Runs on every score change. LIVE match points are provisional; FINISHED are final.
console.log('Recalculating leaderboard...')

const [finSnap, liveSnap, predSnap, userSnap, picksSnap] = await Promise.all([
  db.collection('matches').where('status', '==', 'FINISHED').get(),
  db.collection('matches').where('status', '==', 'LIVE').get(),
  db.collection('predictions').get(),
  db.collection('users').get(),
  db.collection('picks').get(),
])

const finMap       = Object.fromEntries(finSnap.docs.map(d => [d.id, d.data()]))
const liveMap      = Object.fromEntries(liveSnap.docs.map(d => [d.id, d.data()]))
const scoreableMap = { ...finMap, ...liveMap }
const userInfo     = Object.fromEntries(userSnap.docs.map(d => [d.id, d.data()]))
const preds        = predSnap.docs.map(d => d.data())

const statsClean = {}
const pointRows  = []  // only FINISHED — written back to prediction docs

for (const pred of preds) {
  const match = scoreableMap[pred.matchId]
  if (!match) continue
  const pts = calcPoints(pred, match)
  if (finMap[pred.matchId]) pointRows.push({ id: pred.id, pts })
  if (!statsClean[pred.userId]) statsClean[pred.userId] = { totalPoints: 0, exactScoreCount: 0, correctOutcomeCount: 0, correctDrawCount: 0, predictionsSubmitted: 0 }
  const s = statsClean[pred.userId]
  s.totalPoints   += pts
  s.predictionsSubmitted++
  if (pts === 5 || pts === 2) s.exactScoreCount++
  if (pts > 0) s.correctOutcomeCount++
  if (pts === 1 || pts === 2) s.correctDrawCount++
}

// Write pointsAwarded only for FINISHED predictions, in batches of 400
for (let i = 0; i < pointRows.length; i += 400) {
  const b = db.batch()
  for (const { id, pts } of pointRows.slice(i, i + 400)) {
    b.update(db.collection('predictions').doc(id), { pointsAwarded: pts })
  }
  await b.commit()
}

// ─── Tournament winner bonus ───────────────────────────────────────────────
// 10 bonus points for correctly picking the tournament winner (FINAL result).
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
      if (!statsClean[pick.userId]) statsClean[pick.userId] = { totalPoints: 0, exactScoreCount: 0, correctOutcomeCount: 0, correctDrawCount: 0, predictionsSubmitted: 0 }
      statsClean[pick.userId].totalPoints += bonus
      console.log(`  Winner bonus +${bonus} pts → ${pick.userId}`)
    }
  }
  await bonusBatch.commit()
}

// Read current ranks to compute previousRank before overwriting
const currentLbSnap = await db.collection('leaderboard').get()
const currentRankMap = Object.fromEntries(currentLbSnap.docs.map(d => [d.id, d.data().rank ?? null]))

// Write leaderboard + user totals
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
const liveCount = liveSnap.size
console.log(`Leaderboard updated — ${sorted.length} users, ${pointRows.length} predictions scored${liveCount > 0 ? ` (+${liveCount} live match${liveCount > 1 ? 'es' : ''} provisional)` : ''}.`)
