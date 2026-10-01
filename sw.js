// Offline support. Network first so new versions show up right away,
// falling back to the cache when there's no connection.
// Bump CACHE when the SHELL list changes.
const CACHE = 'pnp-v2';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/games.js',
  './js/store.js',
  './js/fx.js',
  './js/icons.js',
  './js/ui.js',
  './js/games/tic-tac-toe/index.js',
  './js/games/tic-tac-toe/engine.js',
  './js/games/tic-tac-toe/style.css',
  './icons/icon.svg',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      } catch {
        return (await cache.match(request, { ignoreSearch: true })) || Response.error();
      }
    })(),
  );
});
