import { useState } from 'react'
import { doc, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../../services/firebase'
import { useAuth } from '../auth/AuthProvider'

const EMOJIS = ['🔥', '😍', '😤', '😂', '🤯']

export interface Reaction {
  matchId: string
  userId: string
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

  // Aggregate counts per emoji
  const counts: Record<string, number> = {}
  for (const r of reactions) counts[r.emoji] = (counts[r.emoji] ?? 0) + 1

  const comments = reactions.filter(r => r.comment?.trim())
  const hasAny = reactions.length > 0

  return (
    <div className={`space-y-2 ${hasAny || user ? 'mt-2' : ''}`}>
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

      {!commenting && myReaction && !myReaction.comment && (
        <button
          onClick={() => { setDraftComment(''); setCommenting(true) }}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          + add comment
        </button>
      )}

      {comments.length > 0 && (
        <div className="space-y-1">
          {comments.map(r => (
            <div key={r.userId} className="flex items-start gap-1.5">
              <span className="text-sm leading-none mt-0.5">{r.emoji}</span>
              <span className="text-xs text-slate-400 leading-snug">{r.comment}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
