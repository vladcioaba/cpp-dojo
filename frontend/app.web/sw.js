/* cpp-dojo service worker — offline app shell + fresh content.
   - /api/*         : never cached (compile, auth, leaderboard need the network)
   - content .md    : network-first, cache fallback (works offline, updates live)
   - everything else: cache-first shell (instant loads, installable) */

const VERSION = "v8";
const SHELL = "shell-" + VERSION;
const RUNTIME = "runtime-" + VERSION;

const SHELL_ASSETS = [
  "/", "/index.html", "/today.html", "/skills.html", "/labs.html", "/ranks.html", "/sprint.html",
  "/styles.css", "/today.css", "/skills.css", "/labs.css", "/sprint.css",
  "/app.js", "/today.js", "/skills.js", "/highlight.js", "/theme.js", "/ranks.js", "/sprint.js", "/pwa.js",
  "/labs-core.js",
  "/labs/treeview.js", "/labs/vector.js", "/labs/heap.js", "/labs/segtree.js",
  "/labs/bst.js", "/labs/rbtree.js", "/labs/graph.js", "/labs/orderbook.js",
  "/labs/verilog.js", "/labs/marketmaker.js",
  "/manifest.webmanifest",
  "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== SHELL && k !== RUNTIME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const { request } = e;
  const url = new URL(request.url);

  if (request.method !== "GET") return;                  // never touch POSTs
  if (url.pathname.startsWith("/api/")) return;          // always hit network

  const isContent = url.pathname.startsWith("/content/") ||
    url.hostname === "raw.githubusercontent.com";

  if (isContent) {
    // network-first so pushed content shows up; fall back to cache offline
    e.respondWith(
      fetch(request).then(res => {
        const copy = res.clone();
        caches.open(RUNTIME).then(c => c.put(request, copy));
        return res;
      }).catch(() => caches.match(request))
    );
    return;
  }

  // app shell: cache-first, revalidate in the background
  e.respondWith(
    caches.match(request).then(cached => {
      const fetched = fetch(request).then(res => {
        if (res.ok && url.origin === location.origin) {
          const copy = res.clone();
          caches.open(SHELL).then(c => c.put(request, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
