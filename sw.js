// Network-first cache: the game works offline after the first visit, and updates
// show up on the next online launch.
const CACHE = 'maltipoo-v9';
const CORE = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'src/main.js', 'src/config.js', 'src/game.js', 'src/art.js', 'src/render.js', 'src/input.js', 'src/audio.js',
  'src/wallet.js', 'src/wardrobe.js', 'proto/outfits.js',
  'assets/dog_stage1.png', 'assets/dog_stage2.png', 'assets/dog_stage3.png',
  'assets/dog_stage4.png', 'assets/dog_stage5.png', 'assets/dog_stage6.png',
  'assets/food_basic.png', 'assets/food_choco.png', 'assets/food_bone.png', 'assets/grass_tile.jpg',
  'proto/render3d.js', 'proto/dogModel.js', 'proto/dogVisual.js', 'proto/fx.js', 'proto/locks.js',
  'proto/meadow.js', 'proto/toon.js', 'proto/hazards.js', 'proto/seasonFx.js', 'src/vendor/three/three.module.js', 'src/vendor/three/three.core.js',
  'src/vendor/three/addons/BufferGeometryUtils.js',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()),
));

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          e.waitUntil(caches.open(CACHE).then((c) => c.put(e.request, copy)));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
