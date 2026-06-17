import { useTodayPredictions } from '../../hooks/useTodayPredictions'
import { useData } from '../../contexts/DataContext'

interface Props {
  loggedIn: boolean
}

export default function TodayPredictionStatus({ loggedIn }: Props) {
  const { statuses, todayMatchIds, loading } = useTodayPredictions(loggedIn)
  const { getMatches, teamMap } = useData()

  if (!loggedIn || todayMatchIds.length === 0) return null

  const todayMatches = getMatches().filter(m => todayMatchIds.includes(m.id))

  if (loading) {
    return (
      <div className="mt-8 max-w-xl mx-auto">
        <div className="h-6 w-40 bg-slate-700 rounded animate-pulse mb-4" />
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-11 bg-slate-800 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mt-8 max-w-xl mx-auto text-left">
      <div className="flex items-center gap-2 mb-3">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Today's Predictions
        </h2>
      </div>

      {/* Match column headers */}
      <div className="flex items-center gap-2 mb-2 pl-[148px]">
        {todayMatches.map(m => {
          const home = teamMap[m.homeTeamId]
          const away = teamMap[m.awayTeamId]
          return (
            <div
              key={m.id}
              className="w-14 text-center text-xs text-slate-500 leading-tight"
              title={`${home?.name ?? m.homeTeamId} vs ${away?.name ?? m.awayTeamId}`}
            >
              <span>{home?.flagEmoji ?? '?'}</span>
              <span className="text-slate-600">v</span>
              <span>{away?.flagEmoji ?? '?'}</span>
            </div>
          )
        })}
      </div>

      {/* User rows */}
      <div className="space-y-1.5">
        {statuses.map(u => {
          const done = u.predictedMatchIds.length
          const total = todayMatchIds.length
          const allDone = done === total
          const noneDone = done === 0

          return (
            <div
              key={u.uid}
              className="flex items-center gap-3 bg-slate-800 rounded-lg px-3 py-2"
            >
              {/* Avatar */}
              {u.photoURL ? (
                <img src={u.photoURL} alt="" className="w-7 h-7 rounded-full shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center text-xs text-white shrink-0">
                  {u.displayName?.[0]?.toUpperCase()}
                </div>
              )}

              {/* Name */}
              <span
                className={`text-sm font-medium w-24 truncate shrink-0 ${
                  allDone ? 'text-white' : noneDone ? 'text-slate-500' : 'text-slate-300'
                }`}
              >
                {u.displayName?.split(' ')[0]}
              </span>

              {/* Per-match status dots */}
              <div className="flex gap-2 flex-1">
                {todayMatches.map(m => {
                  const predicted = u.predictedMatchIds.includes(m.id)
                  return (
                    <div key={m.id} className="w-14 flex justify-center">
                      {predicted ? (
                        <span className="text-green-400 text-base leading-none">✓</span>
                      ) : (
                        <span className="text-slate-600 text-base leading-none">—</span>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Count badge */}
              <span
                className={`text-xs font-bold shrink-0 ${
                  allDone ? 'text-green-400' : noneDone ? 'text-slate-600' : 'text-yellow-400'
                }`}
              >
                {done}/{total}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
