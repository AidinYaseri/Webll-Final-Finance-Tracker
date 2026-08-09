/**
 * Cache-first service worker. A garage is exactly the sort of place with no
 * signal, so everything the app needs is precached on install.
 */

const VERSION = 'trueline-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/app.css',
  './js/app.js',
  './js/math/quat.js',
  './js/math/align.js',
  './js/sensors/orientation.js',
  './js/core/store.js',
  './js/core/compute.js',
  './js/core/feedback.js',
  './js/ui/dom.js',
  './js/ui/components.js',
  './js/ui/live.js',
  './js/ui/screens/home.js',
  './js/ui/screens/camber.js',
  './js/ui/screens/toe.js',
  './js/ui/screens/caster.js',
  './js/ui/screens/report.js',
  './js/ui/screens/adjust.js',
  './js/ui/screens/vehicle.js',
  './js/ui/screens/setup.js',
  './js/ui/screens/help.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) {
        // Refresh in the background so an update lands on the next launch.
        event.waitUntil(
          fetch(request)
            .then((res) => res.ok && caches.open(VERSION).then((c) => c.put(request, res.clone())))
            .catch(() => {}),
        );
        return hit;
      }
      return fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            event.waitUntil(caches.open(VERSION).then((c) => c.put(request, copy)));
          }
          return res;
        })
        .catch(() => caches.match('./index.html'));
    }),
  );
});
