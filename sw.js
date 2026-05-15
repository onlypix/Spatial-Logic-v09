const CACHE_NAME = 'spatial-logic-v0.9';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json'
];

// Telepítés - Fájlok mentése a gyorsítótárba
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Aktiválás - Régi cache törlése
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Fetch - Offline kiszolgálás (Network-first stratégia)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
