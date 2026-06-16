import {
  doc,
  setDoc,
  writeBatch,
  collection,
} from 'firebase/firestore'
import { db } from './firebase'
import type { Match, Team } from '../types'
import teamsData from '../data/teams.json'
import fixturesData from '../data/fixtures.json'

const localTeams = teamsData as Team[]
const localMatches = fixturesData as Match[]

export async function importTeamsToFirestore(): Promise<void> {
  const chunks = chunkArray(localTeams, 500)
  for (const chunk of chunks) {
    const batch = writeBatch(db)
    for (const team of chunk) {
      batch.set(doc(collection(db, 'teams'), team.id), team)
    }
    await batch.commit()
  }
}

export async function importMatchesToFirestore(): Promise<void> {
  const chunks = chunkArray(localMatches, 500)
  for (const chunk of chunks) {
    const batch = writeBatch(db)
    for (const match of chunk) {
      batch.set(doc(collection(db, 'matches'), match.id), match)
    }
    await batch.commit()
  }
}

export async function updateMatchResult(
  matchId: string,
  homeScore: number,
  awayScore: number,
  status: 'FINISHED' | 'LIVE' | 'SCHEDULED' | 'POSTPONED',
): Promise<void> {
  const ref = doc(db, 'matches', matchId)
  await setDoc(
    ref,
    {
      homeScore: status === 'FINISHED' || status === 'LIVE' ? homeScore : null,
      awayScore: status === 'FINISHED' || status === 'LIVE' ? awayScore : null,
      status,
      lastUpdated: new Date().toISOString(),
    } satisfies Partial<Match>,
    { merge: true },
  )
}

export async function updateMatchWinner(
  matchId: string,
  winnerTeamId: string | null,
): Promise<void> {
  await setDoc(
    doc(db, 'matches', matchId),
    { winnerTeamId },
    { merge: true },
  )
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}
