import type { Prediction, Match } from '../types'

type Outcome = 'HOME' | 'AWAY' | 'DRAW'

function getOutcome(home: number, away: number): Outcome {
  if (home > away) return 'HOME'
  if (away > home) return 'AWAY'
  return 'DRAW'
}

export function calculatePoints(prediction: Prediction, match: Match): number {
  if (match.homeScore === null || match.awayScore === null) return 0

  const actualHome = match.homeScore
  const actualAway = match.awayScore
  const predHome = prediction.predictedHomeScore
  const predAway = prediction.predictedAwayScore

  const exactScore = predHome === actualHome && predAway === actualAway
  const actualOutcome = getOutcome(actualHome, actualAway)
  const predOutcome = getOutcome(predHome, predAway)
  const correctOutcome = actualOutcome === predOutcome

  if (exactScore) {
    return actualOutcome === 'DRAW' ? 2 : 5
  }
  if (correctOutcome) {
    return actualOutcome === 'DRAW' ? 1 : 3
  }
  return 0
}
