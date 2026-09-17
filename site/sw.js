const CACHE = "infernal-fechtschule-0.2.0-681d94d034";
const CORE = [
  "./",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon.svg",
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
  "./js/render/procedural-rig.js",
  "./js/render/procedural-scene.js",
  "./js/sim/attacks.js",
  "./js/sim/combo.js",
  "./js/sim/factories.js",
  "./js/sim/lessons.js",
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
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(event.request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      return await fetch(event.request);
    } catch {
      return event.request.mode === 'navigate'
        ? await cache.match('./index.html', { ignoreSearch: true }) || Response.error()
        : Response.error();
    }
  }));
});
