import { useState } from 'react'
import { doc, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../../services/firebase'
import { useAuth } from '../auth/AuthProvider'

const EMOJIS = ['🔥', '😍', '😤', '😂', '🤯']

const AVATAR_COLORS = [
  'bg-blue-600', 'bg-purple-600', 'bg-emerald-600',
  'bg-amber-600', 'bg-rose-600', 'bg-cyan-600',
  'bg-indigo-600', 'bg-orange-500',
]

function avatarColor(userId: string) {
  let h = 0
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) & 0xff
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function initials(name: string | undefined) {
  if (!name) return '?'
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
}

export interface Reaction {
  matchId: string
  userId: string
  displayName: string
  emoji: string
  comment: string
  createdAt: string
  updatedAt: string
}

export default function MatchReactions({
  matchId,
  reactions,
}: {
  matchId: string
  reactions: Reaction[]
}) {
  const { user } = useAuth()
  const [commenting, setCommenting] = useState(false)
  const [draftComment, setDraftComment] = useState('')

  const myReaction = reactions.find(r => r.userId === user?.uid)

  const handleEmoji = async (emoji: string) => {
    if (!user) return
    const ref = doc(db, 'reactions', `${matchId}_${user.uid}`)
    if (myReaction?.emoji === emoji) {
      await deleteDoc(ref)
      setCommenting(false)
    } else {
      const now = new Date().toISOString()
      await setDoc(ref, {
        matchId,
        userId: user.uid,
        displayName: user.displayName ?? '',
        emoji,
        comment: myReaction?.comment ?? '',
        createdAt: myReaction?.createdAt ?? now,
        updatedAt: now,
      })
      setDraftComment(myReaction?.comment ?? '')
      setCommenting(true)
    }
  }

  const handleCommentSave = async () => {
    if (!user || !myReaction) return
    await setDoc(
      doc(db, 'reactions', `${matchId}_${user.uid}`),
      { comment: draftComment.trim(), updatedAt: new Date().toISOString() },
      { merge: true },
    )
    setCommenting(false)
  }

  const counts: Record<string, number> = {}
  for (const r of reactions) counts[r.emoji] = (counts[r.emoji] ?? 0) + 1

  const hasAny = reactions.length > 0

  return (
    <div className={`space-y-2 ${hasAny || user ? 'mt-2' : ''}`}>
      {/* Emoji pill buttons */}
      <div className="flex items-center gap-1 flex-wrap">
        {EMOJIS.map(emoji => {
          const count = counts[emoji] ?? 0
          const myPick = myReaction?.emoji === emoji
          return (
            <button
              key={emoji}
              onClick={() => handleEmoji(emoji)}
              disabled={!user}
              title={user ? (myPick ? 'Remove reaction' : 'React') : 'Sign in to react'}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-sm transition-colors select-none ${
                myPick
                  ? 'bg-blue-600/30 border border-blue-500/60 text-white'
                  : count > 0
                  ? 'bg-slate-700 border border-slate-600 text-slate-200 hover:bg-slate-600'
                  : user
                  ? 'text-slate-600 hover:text-slate-300 hover:bg-slate-700/60 border border-transparent'
                  : 'text-slate-700 border border-transparent cursor-default'
              }`}
            >
              <span>{emoji}</span>
              {count > 0 && <span className="text-xs font-semibold">{count}</span>}
            </button>
          )
        })}
      </div>

      {/* Comment input */}
      {commenting && myReaction && (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={draftComment}
            onChange={e => setDraftComment(e.target.value.slice(0, 60))}
            placeholder="Add a comment… (optional)"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') handleCommentSave() }}
            className="flex-1 text-xs bg-slate-700 text-white rounded px-2.5 py-1.5 border border-slate-600 focus:outline-none focus:border-blue-500 placeholder:text-slate-500"
          />
          <button
            onClick={handleCommentSave}
            className="shrink-0 text-xs bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1.5 rounded font-medium transition-colors"
          >
            Save
          </button>
          <button
            onClick={() => setCommenting(false)}
            className="shrink-0 text-xs text-slate-400 hover:text-white px-1 py-1.5 transition-colors"
          >
            ✕
          </button>
        </div>
      )}

      {/* Per-user attributed reactions list */}
      {reactions.length > 0 && (
        <div className="space-y-1.5">
          {reactions.map(r => {
            const isMe = r.userId === user?.uid
            const inits = initials(r.displayName)
            const color = avatarColor(r.userId)
            const firstName = r.displayName?.split(' ')[0] || 'User'
            return (
              <div key={r.userId} className="flex items-center gap-2 min-w-0">
                <div
                  className={`shrink-0 w-5 h-5 rounded-full ${color} flex items-center justify-center text-white font-bold leading-none`}
                  style={{ fontSize: '9px' }}
                >
                  {inits}
                </div>
                <span className="text-xs text-slate-400 shrink-0">{firstName}</span>
                <span className="text-sm leading-none shrink-0">{r.emoji}</span>
                {r.comment ? (
                  <span className="text-xs text-slate-300 truncate flex-1 min-w-0">{r.comment}</span>
                ) : (
                  <span className="flex-1" />
                )}
                {isMe && !commenting && (
                  <button
                    onClick={() => { setDraftComment(r.comment ?? ''); setCommenting(true) }}
                    className="shrink-0 text-xs text-slate-600 hover:text-slate-400 transition-colors"
                  >
                    {r.comment ? 'edit' : '+ comment'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
