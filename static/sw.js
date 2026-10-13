// Service Worker — Mini Serre PWA
// Cache léger de l'app-shell (CSS/JS/icônes). Les données live (Socket.IO, /api/*)
// passent toujours par le réseau : ce n'est pas fait pour marcher hors-ligne,
// juste pour installer l'app et charger l'interface plus vite.

const CACHE_NAME = "mini-serre-shell-v1";
const APP_SHELL = [
  "/static/css/style.css",
  "/static/js/dashboard.js",
  "/static/icons/icon-192.png",
  "/static/icons/icon-512.png",
  "/static/manifest.json"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Ne jamais intercepter Socket.IO ni les appels API : toujours le réseau, données live.
  if (url.pathname.startsWith("/socket.io") || url.pathname.startsWith("/api/")) {
    return;
  }

  // Page principale : réseau d'abord, cache en secours si hors-ligne.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/") || caches.match(event.request))
    );
    return;
  }

  // Assets statiques : cache d'abord, réseau en secours.
  if (url.pathname.startsWith("/static/")) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});
