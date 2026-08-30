const CACHE = 'infernal-fechtschule-v0.1.1';
const CORE = [
  "./",
  "./assets/woodcut-mark.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./index.html",
  "./js/app/controller.js",
  "./js/audio/audio.js",
  "./js/input/input.js",
  "./js/input/tilt.js",
  "./js/input/touch.js",
  "./js/main.js",
  "./js/network/manual-peer.js",
  "./js/network/protocol.js",
  "./js/render/canvas-renderer.js",
  "./js/sim/attacks.js",
  "./js/sim/factories.js",
  "./js/sim/math.js",
  "./js/sim/rng.js",
  "./js/sim/targeting.js",
  "./js/sim/types.js",
  "./js/sim/upgrades.js",
  "./js/sim/waves.js",
  "./js/sim/world.js",
  "./js/ui/ui.js",
  "./manifest.webmanifest",
  "./styles.css"
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached ?? fetch(event.request).then((response) => {
      if (response.ok && new URL(event.request.url).origin === self.location.origin) {
        const copy = response.clone();
        void caches.open(CACHE).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))
  );
});
