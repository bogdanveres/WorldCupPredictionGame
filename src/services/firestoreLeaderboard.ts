import {
  collection,
  getDocs,
  doc,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase'
import { calculatePoints } from '../utils/scoring'
import type { Prediction, Match, LeaderboardEntry } from '../types'

interface UserStats {
  totalPoints: number
  exactScoreCount: number
  correctOutcomeCount: number
  correctDrawCount: number
  predictionsSubmitted: number
}

export async function recalculateLeaderboard(matches: Match[]): Promise<number> {
  const matchMap = Object.fromEntries(
    matches.filter(m => m.status === 'FINISHED').map(m => [m.id, m]),
  )

  const predictionsSnap = await getDocs(collection(db, 'predictions'))
  const predictions = predictionsSnap.docs.map(d => d.data() as Prediction)

  const userStats = new Map<string, UserStats>()
  const predUpdates: Array<{ id: string; points: number }> = []

  for (const pred of predictions) {
    const match = matchMap[pred.matchId]
    if (!match) continue

    const points = calculatePoints(pred, match)
    predUpdates.push({ id: pred.id, points })

    if (!userStats.has(pred.userId)) {
      userStats.set(pred.userId, {
        totalPoints: 0,
        exactScoreCount: 0,
        correctOutcomeCount: 0,
        correctDrawCount: 0,
        predictionsSubmitted: 0,
      })
    }
    const stats = userStats.get(pred.userId)!
    stats.totalPoints += points
    stats.predictionsSubmitted++
    if (points === 5 || points === 2) stats.exactScoreCount++
    if (points > 0) stats.correctOutcomeCount++
    if (points === 1 || points === 2) stats.correctDrawCount++
  }

  const now = new Date().toISOString()

  // Batch-write prediction pointsAwarded
  const predChunks = chunkArray(predUpdates, 500)
  for (const chunk of predChunks) {
    const batch = writeBatch(db)
    for (const { id, points } of chunk) {
      batch.update(doc(db, 'predictions', id), { pointsAwarded: points })
    }
    await batch.commit()
  }

  // Fetch user display info
  const usersSnap = await getDocs(collection(db, 'users'))
  const userInfoMap = Object.fromEntries(
    usersSnap.docs.map(d => [d.id, d.data() as { displayName: string; photoURL: string | null }]),
  )

  // Sort users by tiebreaker
  const sortedUsers = Array.from(userStats.entries()).sort(([, a], [, b]) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints
    if (b.exactScoreCount !== a.exactScoreCount) return b.exactScoreCount - a.exactScoreCount
    if (b.correctOutcomeCount !== a.correctOutcomeCount) return b.correctOutcomeCount - a.correctOutcomeCount
    return b.predictionsSubmitted - a.predictionsSubmitted
  })

  // Batch-write leaderboard + user totals
  const statsChunks = chunkArray(sortedUsers, 250) // 2 writes per entry (leaderboard + users)
  let rank = 1
  for (const chunk of statsChunks) {
    const batch = writeBatch(db)
    for (const [uid, stats] of chunk) {
      const entry: LeaderboardEntry = {
        uid,
        displayName: userInfoMap[uid]?.displayName ?? uid,
        photoURL: userInfoMap[uid]?.photoURL ?? null,
        previousRank: null,
        rank,
        lastCalculated: now,
        ...stats,
      }
      batch.set(doc(db, 'leaderboard', uid), entry)
      batch.update(doc(db, 'users', uid), {
        totalPoints: stats.totalPoints,
        rank,
        exactScoreCount: stats.exactScoreCount,
        correctOutcomeCount: stats.correctOutcomeCount,
        predictionsSubmitted: stats.predictionsSubmitted,
      })
      rank++
    }
    await batch.commit()
  }

  return predUpdates.length
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}
