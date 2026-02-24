// =============================================
// WOTG Teleprompter — Service Worker
// Auto-updating, network-first for app files
// =============================================
const CACHE_NAME = 'wotg-tp-v5';

// Core assets to pre-cache for offline
const PRECACHE = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png'
];

// Files that should ALWAYS try network first (app code)
const NETWORK_FIRST = ['index.html', 'install.html', '/'];

// ---- INSTALL: pre-cache core assets ----
self.addEventListener('install', e => {
  console.log('[SW] Installing', CACHE_NAME);
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()) // Activate immediately, don't wait
  );
});

// ---- ACTIVATE: delete ALL old caches, claim clients immediately ----
self.addEventListener('activate', e => {
  console.log('[SW] Activating', CACHE_NAME);
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        })
      ))
      .then(() => self.clients.claim()) // Take control of all tabs immediately
      .then(() => {
        // Notify all clients to reload
        self.clients.matchAll({ type: 'window' }).then(clients => {
          clients.forEach(client => client.postMessage({ type: 'SW_UPDATED' }));
        });
      })
  );
});

// ---- FETCH: Network-first for HTML, cache-first for assets ----
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.startsWith('chrome-extension')) return;

  const url = new URL(e.request.url);
  const isAppFile = NETWORK_FIRST.some(f => url.pathname === f || url.pathname.endsWith(f));
  const isNavigation = e.request.mode === 'navigate';

  if (isAppFile || isNavigation) {
    // NETWORK FIRST — always try to get fresh version
    e.respondWith(
      fetch(e.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Offline: serve from cache
          return caches.match(e.request).then(cached => {
            return cached || caches.match('/offline.html');
          });
        })
    );
  } else {
    // CACHE FIRST for static assets (icons, images, etc)
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          }
          return response;
        }).catch(() => {
          if (e.request.mode === 'navigate') return caches.match('/offline.html');
        });
      })
    );
  }
});

// ---- MESSAGE: Force update from client ----
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (e.data === 'CHECK_UPDATE') {
    self.registration.update();
  }
});