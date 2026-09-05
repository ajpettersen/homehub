const APP_ROOT_URL = new URL("./", self.registration.scope).href;
const APP_ROOT = new URL(APP_ROOT_URL).pathname;
const HOMEHUB_CACHE_PREFIX = "homehub-web-";
const LEGACY_NOTIFICATION_ROUTES = new Map([
  ["maintenance", "properties"],
]);
const NOTIFICATION_ROUTES = new Set([
  "",
  "chores",
  "properties",
  "tasks",
  "workouts",
]);

function getNotificationTargetUrl(value) {
  if (typeof value !== "string" || value.trim() === "") return APP_ROOT_URL;

  try {
    const candidate = new URL(value, self.location.origin);
    if (candidate.origin !== self.location.origin) return APP_ROOT_URL;

    const pathWithinApp = candidate.pathname.startsWith(APP_ROOT)
      ? candidate.pathname.slice(APP_ROOT.length)
      : candidate.pathname.replace(/^\/+/, "");
    const route = LEGACY_NOTIFICATION_ROUTES.get(pathWithinApp) ?? pathWithinApp;
    if (!NOTIFICATION_ROUTES.has(route)) return APP_ROOT_URL;

    const target = new URL(route || "./", APP_ROOT_URL);
    target.search = candidate.search;
    target.hash = candidate.hash;
    return target.href;
  } catch {
    return APP_ROOT_URL;
  }
}

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
  const targetUrl = getNotificationTargetUrl(event.notification.data?.url);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      const existing = clients.find((client) => client.url.startsWith(APP_ROOT_URL));
      if (existing) {
        try {
          const navigated = await existing.navigate(targetUrl);
          return (navigated || existing).focus();
        } catch {
          // Fall through and open a fresh HomeHub window.
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});