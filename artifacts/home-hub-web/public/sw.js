const APP_ROOT_URL = new URL("./", self.registration.scope).href;
const APP_ROOT = new URL(APP_ROOT_URL).pathname;
const HOMEHUB_CACHE_PREFIX = "homehub-web-";

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith(HOMEHUB_CACHE_PREFIX))
          .map((cacheName) => caches.delete(cacheName)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "HomeHub", {
      body: data.body || "You have a new household reminder.",
      icon: `${APP_ROOT}icons/app-icon-192.png`,
      badge: `${APP_ROOT}icons/app-icon-192.png`,
      tag: data.tag || "homehub-reminder",
      data: { url: data.url || APP_ROOT },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || APP_ROOT, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url.startsWith(APP_ROOT_URL));
      if (existing) {
        existing.navigate(targetUrl);
        return existing.focus();
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});