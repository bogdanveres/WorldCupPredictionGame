import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where, getDocs } from 'firebase/firestore'
import { db } from '../services/firebase'
import { useData } from '../contexts/DataContext'
import { romaniaGameDateStr, todayRomaniaGameDateStr } from '../utils/timezone'
import type { Prediction, User } from '../types'

export interface TodayUserStatus {
  uid: string
  displayName: string
  photoURL: string | null
  predictedMatchIds: string[]
}

export function useTodayPredictions(loggedIn: boolean) {
  const { getMatches } = useData()
  const [users, setUsers] = useState<User[]>([])
  const [predsByUser, setPredsByUser] = useState<Record<string, string[]>>({})
  const [todayMatchIds, setTodayMatchIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const today = todayRomaniaGameDateStr()
    const ids = getMatches()
      .filter(m => romaniaGameDateStr(m.scheduledKickoffUtc) === today)
      .map(m => m.id)
    setTodayMatchIds(ids)
  }, [getMatches])

  useEffect(() => {
    if (!loggedIn) return
    getDocs(collection(db, 'users')).then(snap =>
      setUsers(snap.docs.map(d => d.data() as User))
    )
  }, [loggedIn])

  useEffect(() => {
    if (!loggedIn || todayMatchIds.length === 0) {
      setLoading(false)
      return
    }
    const q = query(
      collection(db, 'predictions'),
      where('matchId', 'in', todayMatchIds),
    )
    const unsub = onSnapshot(q, snap => {
      const byUser: Record<string, string[]> = {}
      for (const d of snap.docs) {
        const p = d.data() as Prediction
        ;(byUser[p.userId] ??= []).push(p.matchId)
      }
      setPredsByUser(byUser)
      setLoading(false)
    })
    return unsub
  }, [loggedIn, todayMatchIds])

  const statuses: TodayUserStatus[] = users
    .map(u => ({
      uid: u.uid,
      displayName: u.displayName,
      photoURL: u.photoURL,
      predictedMatchIds: predsByUser[u.uid] ?? [],
    }))
    .sort((a, b) => b.predictedMatchIds.length - a.predictedMatchIds.length)

  return { statuses, todayMatchIds, loading }
}
