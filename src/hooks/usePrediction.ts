import { useState, useEffect, useCallback } from 'react'
import { getPrediction, upsertPrediction } from '../services/firestorePredictions'
import { isBeforeKickoff } from '../utils/timezone'
import type { Prediction, Match } from '../types'

interface UsePredictionResult {
  prediction: Prediction | null
  loading: boolean
  saving: boolean
  canEdit: boolean
  save: (home: number, away: number) => Promise<void>
  error: string | null
}

export function usePrediction(
  userId: string | null,
  match: Match,
): UsePredictionResult {
  const [prediction, setPrediction] = useState<Prediction | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canEdit =
    !!userId &&
    match.status !== 'LIVE' &&
    match.status !== 'FINISHED' &&
    match.status !== 'ABANDONED' &&
    isBeforeKickoff(match.scheduledKickoffUtc)

  useEffect(() => {
    if (!userId) return
    setLoading(true)
    getPrediction(userId, match.id)
      .then(setPrediction)
      .catch(() => setError('Failed to load prediction'))
      .finally(() => setLoading(false))
  }, [userId, match.id])

  const save = useCallback(
    async (home: number, away: number) => {
      if (!userId) return
      setSaving(true)
      setError(null)
      try {
        await upsertPrediction(userId, match.id, home, away)
        const updated = await getPrediction(userId, match.id)
        setPrediction(updated)
      } catch {
        setError('Failed to save prediction')
      } finally {
        setSaving(false)
      }
    },
    [userId, match.id],
  )

  return { prediction, loading, saving, canEdit, save, error }
}
