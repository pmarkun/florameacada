const cacheName = 'flora-2026-cartas-a-flora-1';
const assets = ["/app.js", "/botanica.json", "/catalogo.json", "/fonte-181da826c7.woff2", "/fonte-b23589aa84.woff2", "/fonte-d9ec821052.woff2", "/fonts.css", "/grain.webp", "/icone-192.png", "/icone-512.png", "/index.html", "/jucara.webp", "/mapa-brasil.json", "/manifest.webmanifest", "/plate.webp", "/pranchas.json", "/style.css"];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(assets)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) =>
    key.startsWith('flora-2026-') && key !== cacheName).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate' && !/^\/admin(?:[./]|$)/.test(new URL(request.url).pathname)) {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html', {cacheName})));
    return;
  }
  if (assets.includes(new URL(request.url).pathname)) {
    event.respondWith(caches.match(request, {cacheName, ignoreSearch:true}).then((response) => response || fetch(request)));
  }
});
