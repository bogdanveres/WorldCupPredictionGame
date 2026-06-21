import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { collection, getDocs } from 'firebase/firestore'
import { useAuth } from '../components/auth/AuthProvider'
import { useData } from '../contexts/DataContext'
import { db } from '../services/firebase'
import { todayRomaniaGameDateStr, romaniaGameDateStr } from '../utils/timezone'
import TodayPredictionStatus from '../components/predictions/TodayPredictionStatus'
import TournamentWinnerPick from '../components/picks/TournamentWinnerPick'
import NotificationButton from '../components/notifications/NotificationButton'
import type { Prediction } from '../types'

export default function Home() {
  const { user, login } = useAuth()

  return (
    <div className="max-w-xl mx-auto px-4 py-12 text-center">
      <div className="text-5xl mb-3">⚽</div>
      <h1 className="text-3xl font-bold text-white mb-1">World Cup 2026</h1>
      <p className="text-slate-400 mb-8">Prediction Game — Romania Edition</p>

      {!user ? (
        <div className="space-y-4">
          <p className="text-slate-300">Sign in to submit predictions and compete on the leaderboard.</p>
          <button
            onClick={login}
            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-lg font-semibold text-lg"
          >
            Sign in with Google
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            <p className="text-slate-300">Welcome back, {user.displayName?.split(' ')[0]}!</p>
            <Link
              to="/fixtures"
              className="inline-block bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg font-semibold"
            >
              View Fixtures
            </Link>
          </div>

          <TodayPredictionStatus loggedIn={!!user} />
          <TournamentWinnerPick />
          <BestPredictionWidget />
          <NotificationButton />
        </>
      )}
    </div>
  )
}

function BestPredictionWidget() {
  const { matches, teamMap } = useData()
  const [preds, setPreds] = useState<Prediction[] | null>(null)
  const [users, setUsers] = useState<Record<string, string>>({})

  useEffect(() => {
    getDocs(collection(db, 'predictions')).then(snap => {
      setPreds(snap.docs.map(d => d.data() as Prediction).filter(p => p.pointsAwarded === 5 || p.pointsAwarded === 2))
    })
    getDocs(collection(db, 'users')).then(snap => {
      setUsers(Object.fromEntries(snap.docs.map(d => [d.id, (d.data().displayName as string) ?? d.id])))
    })
  }, [])

  const highlight = useMemo(() => {
    if (!preds || !matches.length) return null
    const todayStr = todayRomaniaGameDateStr()

    // Find finished matches from today (or most recent match day)
    const finishedToday = matches.filter(
      m => m.status === 'FINISHED' && romaniaGameDateStr(m.scheduledKickoffUtc) === todayStr
    )
    const targetMatchIds = finishedToday.length > 0
      ? new Set(finishedToday.map(m => m.id))
      : (() => {
          // Fall back to most recent match day with finished matches
          const days = [...new Set(
            matches.filter(m => m.status === 'FINISHED').map(m => romaniaGameDateStr(m.scheduledKickoffUtc))
          )].sort()
          const lastDay = days[days.length - 1]
          return new Set(matches.filter(m => romaniaGameDateStr(m.scheduledKickoffUtc) === lastDay).map(m => m.id))
        })()

    const candidates = preds.filter(p => targetMatchIds.has(p.matchId))
    if (candidates.length === 0) return null

    // Pick the most impressive: prefer exact non-draws (5pts), then exact draws (2pts)
    const best = candidates.reduce((a, b) => (b.pointsAwarded ?? 0) > (a.pointsAwarded ?? 0) ? b : a)
    const match = matches.find(m => m.id === best.matchId)
    if (!match) return null

    return { pred: best, match }
  }, [preds, matches])

  if (!highlight) return null

  const { pred, match } = highlight
  const home = teamMap[match.homeTeamId]
  const away = teamMap[match.awayTeamId]
  const name = users[pred.userId]?.split(' ')[0] ?? 'Someone'
  const isExactDraw = pred.pointsAwarded === 2

  return (
    <div className="mt-6 text-left">
      <div className="bg-slate-800 border border-green-800/40 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🎯</span>
          <span className="text-sm font-semibold text-green-400">
            {isExactDraw ? 'Exact draw' : 'Exact score'} of the day
          </span>
        </div>
        <div className="flex items-center justify-center gap-2 text-white font-medium">
          <span className="text-2xl">{home?.flagEmoji}</span>
          <span>{home?.shortName}</span>
          <span className="text-xl font-bold text-green-400 tabular-nums mx-1">
            {pred.predictedHomeScore}–{pred.predictedAwayScore}
          </span>
          <span>{away?.shortName}</span>
          <span className="text-2xl">{away?.flagEmoji}</span>
        </div>
        <p className="text-center text-slate-400 text-sm mt-2">
          Predicted by <span className="text-white font-semibold">{name}</span>
          {' '}· {pred.pointsAwarded} pts
        </p>
      </div>
    </div>
  )
}
