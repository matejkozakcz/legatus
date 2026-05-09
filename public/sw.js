const CACHE_NAME = "legatus-v3";
const STATIC_ASSETS = ["/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Listen for explicit skipWaiting message from the page
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Navigation requests (HTML): always network, never cache — avoids stale app shell after deploy.
// Other GETs: network-first with cache fallback.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/~oauth")) return;
  if (url.pathname === "/version.json") return; // always hit network for build version
  if (url.hostname.includes("supabase.co")) return;

  const isNavigation =
    event.request.mode === "navigate" ||
    event.request.destination === "document";

  if (isNavigation) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" }).catch(() =>
        caches.match(event.request).then((r) => r || caches.match("/"))
      )
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ─── Web Push ────────────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Legatus", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Legatus";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.notification_id || undefined,
    renotify: !!data.notification_id,
    data: {
      link_url: data.link_url || "/",
      notification_id: data.notification_id || null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link_url) || "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Try to focus an existing window and navigate it
        for (const client of clientList) {
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client) {
              try {
                client.navigate(link);
              } catch {}
            }
            return;
          }
        }
        if (clients.openWindow) return clients.openWindow(link);
      })
  );
});
