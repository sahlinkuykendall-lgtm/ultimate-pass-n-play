// Offline support. Network first so new versions show up right away,
// falling back to the cache when there's no connection.
// Bump CACHE when the SHELL list changes.
const CACHE = 'pnp-v10';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './css/kit.css',
  './js/app.js',
  './js/games.js',
  './js/store.js',
  './js/fx.js',
  './js/icons.js',
  './js/ui.js',
  './js/games/kit.js',
  './js/games/tic-tac-toe/index.js',
  './js/games/tic-tac-toe/engine.js',
  './js/games/tic-tac-toe/style.css',
  './js/games/dots-and-boxes/index.js',
  './js/games/dots-and-boxes/engine.js',
  './js/games/dots-and-boxes/style.css',
  './js/games/connect-four/index.js',
  './js/games/connect-four/engine.js',
  './js/games/connect-four/style.css',
  './js/games/mini-golf/index.js',
  './js/games/mini-golf/engine.js',
  './js/games/mini-golf/course.js',
  './js/games/mini-golf/render.js',
  './js/games/mini-golf/render3d.js',
  './js/vendor/three.js',
  './js/games/mini-golf/style.css',
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

// GitHub Pages marks files fresh for 10 minutes, so the browser's in-memory cache
// would happily reuse old scripts without even asking this worker. Re-label what
// we hand back as no-cache so every load comes through here (network first).
function revalidating(response) {
  if (!response.ok || response.type === 'opaque') return response;
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-cache');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        // no-cache: always revalidate with the server so updates never hide behind the HTTP cache
        const fresh = await fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' });
        if (fresh.ok) cache.put(request, fresh.clone());
        return revalidating(fresh);
      } catch {
        const hit = await cache.match(request, { ignoreSearch: true });
        return hit ? revalidating(hit) : Response.error();
      }
    })(),
  );
});
