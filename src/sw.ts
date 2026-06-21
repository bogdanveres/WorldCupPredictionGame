/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope & typeof globalThis

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/WorldCupPredictionGame/index.html'), {
    denylist: [/^\/api\//],
  }),
)

self.addEventListener('push', event => {
  const data = (event as PushEvent).data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'WC2026 Predictions', {
      body: data.body ?? '',
      icon: '/WorldCupPredictionGame/icon-192.svg',
      badge: '/WorldCupPredictionGame/icon-192.svg',
      tag: data.tag ?? 'wc2026',
      data: { url: data.url ?? '/WorldCupPredictionGame/' },
    } as NotificationOptions),
  )
})

self.addEventListener('notificationclick', event => {
  (event as NotificationEvent).notification.close()
  const url = ((event as NotificationEvent).notification.data as { url?: string })?.url ?? '/WorldCupPredictionGame/'
  event.waitUntil(self.clients.openWindow(url))
})
