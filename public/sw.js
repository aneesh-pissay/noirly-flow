/*
 * Noirly Flow service worker: read-only offline.
 *
 * - Built assets (/_next/static, icons) are cache-first; their names change with every build.
 * - Pages and API reads are network-first. A good answer is saved; when the network
 *   fails, the saved copy is served with `X-Flow-From-Cache: 1` so the app can say it's offline.
 * - Writes (anything but GET) are never touched or queued: offline, they fail.
 * - Saved pages and data belong to whoever was signed in. The app deletes them on
 *   sign-out and on the login page (see src/lib/offline.ts).
 */
const VERSION = "v1";
const STATIC_CACHE = `flow-static-${VERSION}`;
const PAGES_CACHE = `flow-pages-${VERSION}`;
const DATA_CACHE = `flow-data-${VERSION}`;
const OFFLINE_PAGE = "/offline.html";
const KEEP = [STATIC_CACHE, PAGES_CACHE, DATA_CACHE];

// Never saved: sign-in, secrets, live feeds, files, and anything public-facing.
const NO_STORE = [
  /^\/api\/auth\//, /^\/api\/cron\//, /^\/api\/me\/tokens/, /^\/api\/me\/calendar-feed/,
  /^\/api\/realtime/, /^\/api\/attachments\//, /^\/api\/tasks\/[^/]+\/attachments/, /^\/api\/calendar\//,
  /^\/api\/forms\/public\//, /^\/api\/webhooks\//, /^\/api\/workspaces\/[^/]+\/webhooks/,
];
const NO_STORE_PAGES = [/^\/login/, /^\/invite\//, /^\/f\//, /^\/offline\.html$/];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll([OFFLINE_PAGE, "/icons/icon-192.png"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("flow-") && !KEEP.includes(key)) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

/** A copy of a saved response, marked as coming from the cache. */
async function fromCache(cached) {
  const headers = new Headers(cached.headers);
  headers.set("X-Flow-From-Cache", "1");
  return new Response(await cached.blob(), { status: cached.status, statusText: cached.statusText, headers });
}

async function networkFirst(event, cacheName, fallback) {
  const { request } = event;
  try {
    const response = await fetch(request);
    // Only plain successes: not a redirect (to /login, say), not an opaque answer.
    if (response.ok && !response.redirected && response.type === "basic") {
      const copy = response.clone();
      event.waitUntil(caches.open(cacheName).then((cache) => cache.put(request, copy)).catch(() => {}));
    }
    return response;
  } catch {
    const cache = await caches.open(cacheName);
    const cached = (await cache.match(request))
      ?? (request.mode === "navigate" ? await cache.match(request, { ignoreSearch: true }) : undefined);
    return cached ? fromCache(cached) : fallback();
  }
}

async function cacheFirst(event) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(event.request);
  if (cached) return cached;
  const response = await fetch(event.request);
  if (response.ok) {
    const copy = response.clone();
    event.waitUntil(cache.put(event.request, copy).catch(() => {}));
  }
  return response;
}

const offlineJson = () => new Response(
  JSON.stringify({ error: "offline", message: "You're offline, and this hasn't been loaded on this device before." }),
  { status: 503, headers: { "Content-Type": "application/json", "X-Flow-From-Cache": "1" } },
);

const offlinePage = async () => (await caches.match(OFFLINE_PAGE)) ?? Response.error();

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;

  if (path.startsWith("/_next/static/") || path.startsWith("/icons/")) {
    event.respondWith(cacheFirst(event));
  } else if (path.startsWith("/api/")) {
    if (NO_STORE.some((pattern) => pattern.test(path))) return;
    event.respondWith(networkFirst(event, DATA_CACHE, offlineJson));
  } else if (request.mode === "navigate") {
    if (NO_STORE_PAGES.some((pattern) => pattern.test(path))) return;
    event.respondWith(networkFirst(event, PAGES_CACHE, offlinePage));
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "clear-user-data") {
    event.waitUntil(Promise.all([caches.delete(PAGES_CACHE), caches.delete(DATA_CACHE)]));
  }
});
