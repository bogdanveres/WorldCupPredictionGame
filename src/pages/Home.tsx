import { Link } from 'react-router-dom'
import { useAuth } from '../components/auth/AuthProvider'
import TodayPredictionStatus from '../components/predictions/TodayPredictionStatus'

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
        </>
      )}
    </div>
  )
}
