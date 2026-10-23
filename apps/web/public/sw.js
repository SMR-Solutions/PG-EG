const CACHE_NAME = "pg-eg-v5";
const STATIC_ASSETS = [
  "/",
  "/offline",
  "/find-pg",
  "/dashboard",
  "/favicon.ico",
  "/favicon-32x32.png",
  "/icon-192x192.png",
  "/icon-512x512.png",
  "/apple-touch-icon.png",
  "/site.webmanifest",
];

// Install: pre-cache core application shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(STATIC_ASSETS).catch((err) => console.warn("[SW] Pre-cache warning:", err))
    )
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch handler: optimized for low internet and offline resilience
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip localhost / development completely so dev HMR and updates are instant
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return;

  // Skip non-GET and chrome-extension requests
  if (request.method !== "GET" || url.protocol === "chrome-extension:") return;

  // API calls: network-only (always fresh data), quick offline fallback
  if (
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("render.com") ||
    url.hostname.includes("railway.app")
  ) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: "Offline" }), {
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    return;
  }

  // Next.js static JS/CSS assets: Cache-First for instant loading
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // Navigation requests: Fast network with 1.8s timeout, instant cache fallback for low internet
  if (request.mode === "navigate") {
    event.respondWith(
      new Promise((resolve) => {
        let hasResolved = false;

        // If network is slow / taking > 1.8s, fallback to cache immediately
        const timer = setTimeout(() => {
          if (!hasResolved) {
            caches.match(request).then((cached) => {
              if (cached && !hasResolved) {
                hasResolved = true;
                resolve(cached);
              } else {
                caches.match("/").then((rootCached) => {
                  if (rootCached && !hasResolved) {
                    hasResolved = true;
                    resolve(rootCached);
                  }
                });
              }
            });
          }
        }, 1800);

        fetch(request)
          .then((res) => {
            clearTimeout(timer);
            if (res && res.status === 200) {
              const clone = res.clone();
              caches.open(CACHE_NAME).then((c) => c.put(request, clone));
            }
            if (!hasResolved) {
              hasResolved = true;
              resolve(res);
            }
          })
          .catch(() => {
            clearTimeout(timer);
            if (!hasResolved) {
              hasResolved = true;
              caches.match(request)
                .then((cached) => cached || caches.match("/") || caches.match("/offline"))
                .then((fallback) => resolve(fallback || new Response("Offline", { status: 503 })));
            }
          });
      })
    );
    return;
  }

  // Other static assets (images, fonts, icons): Cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (!res || res.status !== 200 || res.type === "opaque") return res;
        const clone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(request, clone));
        return res;
      });
    })
  );
});
