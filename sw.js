// AntechEvents service worker: app-shell precache, security-aware runtime caching,
// offline fallback, user-controlled updates, and local notification handling.
// No secrets live here — it never caches auth/Firestore responses and holds no keys.

// Bump VERSION to invalidate every cache on the next activation.
const VERSION = "v1";
const STATIC_CACHE = `antechevents-static-${VERSION}`;
const RUNTIME_CACHE = `antechevents-runtime-${VERSION}`;
const CACHES = [STATIC_CACHE, RUNTIME_CACHE];

// A deliberately small app shell: the offline page, styles, icons, and the core
// authed route. Everything else is cached lazily at runtime.
const PRECACHE = [
  "/offline.html",
  "/css/output.css",
  "/assets/icons/favicon.svg",
  "/assets/icons/maskable.svg",
  "/manifest.json",
];

// Cross-origin hosts whose responses must never be cached (auth + data + SDK).
const NEVER_CACHE_HOSTS = [
  "googleapis.com",
  "gstatic.com",
  "firebaseio.com",
  "firebaseapp.com",
  "identitytoolkit",
  "firestore",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !CACHES.includes(k)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// Update handshake: the page asks us to activate the waiting worker on user click.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

function isNeverCache(url) {
  return NEVER_CACHE_HOSTS.some((host) => url.hostname.includes(host));
}

// Network-first for navigations so authed HTML is never served stale while online;
// falls back to a cached copy, then the offline page.
async function handleNavigation(request) {
  try {
    const fresh = await fetch(request);
    return fresh;
  } catch {
    const cached = await caches.match(request);
    return cached || caches.match("/offline.html");
  }
}

// Stale-while-revalidate for same-origin static assets: instant load, silent refresh.
async function handleStatic(request) {
  const cached = await caches.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    })
    .catch(() => null);
  return cached || network || fetch(request);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isNeverCache(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (/\.(?:css|js|svg|png|jpg|jpeg|webp|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(handleStatic(request));
  }
});

// Focus an existing AntechEvents tab if one is open, else open the target URL.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(href);
          return client.focus();
        }
      }
      return self.clients.openWindow(href);
    })
  );
});

// Inert boundary: only fires if a future secure backend sends Web Push. No FCM SDK
// and no token handling ship today, so this is a safe no-op on the free plan.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "AntechEvents", body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "AntechEvents", {
      body: payload.body || "",
      icon: "/assets/icons/favicon.svg",
      badge: "/assets/icons/favicon.svg",
      data: { href: payload.href || "/dashboard" },
    })
  );
});
