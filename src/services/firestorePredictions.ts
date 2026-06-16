import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore'
import { db } from './firebase'
import type { Prediction } from '../types'

function predictionId(userId: string, matchId: string) {
  return `${userId}_${matchId}`
}

export async function getPrediction(
  userId: string,
  matchId: string,
): Promise<Prediction | null> {
  const ref = doc(db, 'predictions', predictionId(userId, matchId))
  const snap = await getDoc(ref)
  return snap.exists() ? (snap.data() as Prediction) : null
}

export async function upsertPrediction(
  userId: string,
  matchId: string,
  predictedHomeScore: number,
  predictedAwayScore: number,
): Promise<void> {
  const id = predictionId(userId, matchId)
  const ref = doc(db, 'predictions', id)
  const existing = await getDoc(ref)

  const now = new Date().toISOString()

  if (existing.exists()) {
    await setDoc(
      ref,
      {
        predictedHomeScore,
        predictedAwayScore,
        updatedAt: now,
      },
      { merge: true },
    )
  } else {
    const prediction: Prediction = {
      id,
      userId,
      matchId,
      predictedHomeScore,
      predictedAwayScore,
      submittedAt: now,
      updatedAt: now,
      lockedAt: null,
      pointsAwarded: null,
      isManualEntry: false,
      manuallyEnteredByAdmin: null,
    }
    await setDoc(ref, prediction)
  }
}

export async function getUserPredictions(userId: string): Promise<Prediction[]> {
  const q = query(
    collection(db, 'predictions'),
    where('userId', '==', userId),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => d.data() as Prediction)
}

export async function getMatchPredictions(matchId: string): Promise<Prediction[]> {
  const q = query(
    collection(db, 'predictions'),
    where('matchId', '==', matchId),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => d.data() as Prediction)
}
