import { useState, useEffect } from 'react'
import { doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore'
import { db } from '../../services/firebase'
import { useAuth } from '../auth/AuthProvider'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

type State = 'loading' | 'unsupported' | 'unconfigured' | 'denied' | 'subscribed' | 'unsubscribed'

export default function NotificationButton() {
  const { user } = useAuth()
  const [state, setState] = useState<State>('loading')
  const [working, setWorking] = useState(false)

  useEffect(() => {
    if (!user) return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported')
      return
    }
    if (!VAPID_PUBLIC_KEY) {
      setState('unconfigured')
      return
    }
    if (Notification.permission === 'denied') {
      setState('denied')
      return
    }
    getDoc(doc(db, 'pushSubscriptions', user.uid)).then(snap => {
      setState(snap.exists() ? 'subscribed' : 'unsubscribed')
    })
  }, [user?.uid])

  const subscribe = async () => {
    if (!user || !VAPID_PUBLIC_KEY) return
    setWorking(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setState('denied'); return }

      const reg = await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()
      const sub = existing ?? await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
      await setDoc(doc(db, 'pushSubscriptions', user.uid), {
        userId: user.uid,
        subscription: JSON.parse(JSON.stringify(sub)),
        createdAt: new Date().toISOString(),
      })
      setState('subscribed')
    } catch (err) {
      console.error('Push subscribe failed:', err)
    } finally {
      setWorking(false)
    }
  }

  const unsubscribe = async () => {
    if (!user) return
    setWorking(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      await sub?.unsubscribe()
      await deleteDoc(doc(db, 'pushSubscriptions', user.uid))
      setState('unsubscribed')
    } catch (err) {
      console.error('Push unsubscribe failed:', err)
    } finally {
      setWorking(false)
    }
  }

  if (!user || state === 'loading' || state === 'unsupported' || state === 'unconfigured') return null

  if (state === 'denied') {
    return (
      <p className="text-xs text-slate-500 mt-3">
        Notifications blocked — enable them in browser settings.
      </p>
    )
  }

  if (state === 'subscribed') {
    return (
      <button
        onClick={unsubscribe}
        disabled={working}
        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors mt-3 mx-auto"
      >
        <span>🔔</span>
        <span>{working ? 'Saving…' : 'Notifications on · tap to disable'}</span>
      </button>
    )
  }

  return (
    <button
      onClick={subscribe}
      disabled={working}
      className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors mt-3 mx-auto"
    >
      <span>🔕</span>
      <span>{working ? 'Enabling…' : 'Enable match notifications'}</span>
    </button>
  )
}
