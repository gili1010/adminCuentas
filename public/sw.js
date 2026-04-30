const CACHE = 'cuentas-v1'
const PRECACHE = ['/', '/src/main.jsx']

self.addEventListener('install', (e) => {
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  // Only cache GET requests for same origin
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return

  e.respondWith(
    fetch(e.request)
      .then((response) => {
        const clone = response.clone()
        caches.open(CACHE).then((cache) => cache.put(e.request, clone))
        return response
      })
      .catch(() => caches.match(e.request)),
  )
})
