// Macro Pulse — Service Worker
// Caches the dashboard and data for offline viewing.

const CACHE_NAME = 'macro-pulse-v2';
const STATIC_ASSETS = [
  './',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
];
// Google Fonts to cache on first load
const FONT_ORIGINS = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
];

// Install: pre-cache static shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network-first for the dashboard, cache-first for static assets & fonts
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests (e.g. POST /refresh)
  if (event.request.method !== 'GET') return;

  // For the main dashboard page — network first, fall back to cache
  if (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html') ||
      url.pathname.endsWith('/macro_dashboard.html')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // For fonts — cache first (they rarely change)
  if (FONT_ORIGINS.some((origin) => url.href.startsWith(origin))) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Everything else (icons, manifest) — cache first, network fallback
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
