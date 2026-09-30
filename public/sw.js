const CACHE_NAME = "datavizlab-v3";
const CORE = ["/", "/favicon.svg", "/manifest.webmanifest", "/sample-energy.csv", "/og.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

const store = (request, response) => {
  if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
  return response;
};

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // Pages: the network first, so a new deploy is picked up at once; the cached shell keeps the app working offline.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => store(request, response)).catch(() => caches.match(request).then((cached) => cached || caches.match("/"))));
    return;
  }
  // Hashed build files and versioned thumbnails never change under the same URL: the cache answers first.
  // Anything else is served from the cache and refreshed in the background.
  const immutable = url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/thumbs/");
  event.respondWith(caches.match(request).then((cached) => {
    const network = fetch(request).then((response) => store(request, response));
    if (cached) {
      if (!immutable) event.waitUntil(network.catch(() => undefined));
      return cached;
    }
    return network;
  }));
});
