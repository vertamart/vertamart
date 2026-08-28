/* Vertamart Service Worker — instalación PWA, caché offline y notificaciones push */
const CACHE = 'vertamart-v1'
const PRECACHE = ['/', '/favicon.svg', '/icon-512.svg', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

// Navegación: red cae a cache (solo shell) → página offline.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {})
        return res
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => cached || caches.match('/'))
      }),
  )
})

// Notificaciones push.
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data ? event.data.text() : '' } }
  const options = {
    body: data.body || '',
    icon: data.icon || '/favicon.svg',
    badge: '/favicon.svg',
    data: { url: data.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(data.title || 'Vertamart', options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).pathname === url || client.url.includes(url)) { return client.focus() }
      }
      return self.clients.openWindow(url)
    }),
  )
})