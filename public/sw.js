// Cache the app shell only. Private chat and API responses never enter this cache.
const CACHE = 'kiki-shell-v1'
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/', '/icon-192.png'])))
  self.skipWaiting()
})
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))),
    self.clients.claim(),
  ]))
})
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request, { cache: 'no-cache' }).then(response => {
      if (response.ok) {
        const copy = response.clone()
        event.waitUntil(caches.open(CACHE).then(cache => cache.put('/', copy)))
      }
      return response
    }).catch(() => caches.match('/')))
  } else if (/^\/(assets\/|icon|apple-touch-icon|manifest)/.test(url.pathname)) {
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (response.ok) {
        const copy = response.clone()
        event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)))
      }
      return response
    })))
  }
})
self.addEventListener('push', event => {
  // The server sends no private message text in notification payloads.
  let data = {}
  try { data = event.data?.json() || {} } catch { /* A generic notification is still useful. */ }
  event.waitUntil(self.registration.showNotification(data.title || 'Kiki', {
    body: data.body || 'You have a new message.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'kiki-message',
    data: { url: '/' },
  }))
})
self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
    const client = clients.find(client => new URL(client.url).origin === self.location.origin)
    if (client) { await client.focus(); return client.navigate('/') }
    return self.clients.openWindow('/')
  }))
})
