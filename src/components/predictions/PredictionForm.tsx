import { useState, useEffect } from 'react'
import { usePrediction } from '../../hooks/usePrediction'
import { useAuth } from '../auth/AuthProvider'
import type { Match } from '../../types'

interface Props {
  match: Match
}

export default function PredictionForm({ match }: Props) {
  const { user } = useAuth()
  const { prediction, loading, saving, canEdit, save, error } = usePrediction(
    user?.uid ?? null,
    match,
  )

  const [home, setHome] = useState('')
  const [away, setAway] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (prediction) {
      setHome(String(prediction.predictedHomeScore))
      setAway(String(prediction.predictedAwayScore))
    }
  }, [prediction])

  if (!user) {
    return (
      <p className="text-xs text-slate-500 text-center mt-2">
        Sign in to predict
      </p>
    )
  }

  if (loading) {
    return <div className="h-8 mt-2 rounded bg-slate-700 animate-pulse" />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const h = parseInt(home)
    const a = parseInt(away)
    if (isNaN(h) || isNaN(a) || h < 0 || a < 0) return
    await save(h, a)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!canEdit) {
    if (!prediction) {
      return (
        <p className="text-xs text-slate-500 text-center mt-2">
          {match.status === 'FINISHED' ? 'No prediction submitted' : 'Prediction locked'}
        </p>
      )
    }
    return (
      <div className="mt-2 flex items-center justify-center gap-3">
        <span className="text-xs text-slate-400">Your prediction:</span>
        <span className="text-sm font-bold text-blue-400">
          {prediction.predictedHomeScore} – {prediction.predictedAwayScore}
        </span>
        {prediction.pointsAwarded !== null && (
          <span className="text-xs font-semibold text-yellow-400">
            {prediction.pointsAwarded} pts
          </span>
        )}
        <span className="text-xs text-slate-500">🔒</span>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2">
      <div className="flex items-center justify-center gap-2">
        <ScoreInput value={home} onChange={setHome} />
        <span className="text-slate-400 text-sm">–</span>
        <ScoreInput value={away} onChange={setAway} />
        <button
          type="submit"
          disabled={saving || home === '' || away === ''}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold rounded transition-colors"
        >
          {saving ? '...' : saved ? '✓' : prediction ? 'Update' : 'Predict'}
        </button>
      </div>
      {error && <p className="text-xs text-red-400 text-center mt-1">{error}</p>}
    </form>
  )
}

function ScoreInput({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <input
      type="number"
      min={0}
      max={99}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder="0"
      className="w-10 text-center bg-slate-700 border border-slate-600 rounded text-white text-sm py-1 focus:outline-none focus:border-blue-500"
    />
  )
}
