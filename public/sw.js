const CACHE_VERSION = 'brok-pwa-v1'
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`
const STATIC_CACHE = `${CACHE_VERSION}-static`
const APP_SHELL = [
  '/',
  '/offline.html',
  '/pwa/icon-192.png',
  '/pwa/icon-512.png'
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then(cache => cache.addAll(APP_SHELL))
  )
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(
              key =>
                key.startsWith('brok-pwa-') && !key.startsWith(CACHE_VERSION)
            )
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/uploads/')
  ) {
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone()
          caches.open(APP_SHELL_CACHE).then(cache => cache.put(request, copy))
          return response
        })
        .catch(async () => {
          const cached = await caches.match(request)
          return cached || caches.match('/offline.html')
        })
    )
    return
  }

  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/pwa/') ||
    url.pathname.startsWith('/brand/') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js')
  ) {
    event.respondWith(
      caches.match(request).then(cached => {
        const network = fetch(request)
          .then(response => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(STATIC_CACHE).then(cache => cache.put(request, copy))
            }
            return response
          })
          .catch(() => cached)

        return cached || network
      })
    )
  }
})
