const API_ROOT = "/api";

function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bytes = atob(base64);
  return Uint8Array.from(bytes, (character) => character.charCodeAt(0));
}

export function supportsWebPush(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function isStandaloneWebApp(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

export async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register(
    `${import.meta.env.BASE_URL}sw.js`,
    { scope: import.meta.env.BASE_URL, updateViaCache: "none" },
  );
  await navigator.serviceWorker.ready;
  return registration;
}

export async function getCurrentWebPushSubscription(): Promise<PushSubscription | null> {
  if (!supportsWebPush()) return null;
  const registration = await getServiceWorkerRegistration();
  return registration.pushManager.getSubscription();
}

export async function enableWebPush(): Promise<PushSubscription> {
  if (!supportsWebPush()) throw new Error("This browser does not support push notifications.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notifications are blocked. Enable them in your phone settings, then try again."
        : "Notification permission was not granted.",
    );
  }
  const registration = await getServiceWorkerRegistration();
  const existing = await registration.pushManager.getSubscription();
  const keyResponse = await fetch(`${API_ROOT}/web-push/public-key`, {
    credentials: "include",
  });
  if (!keyResponse.ok) throw new Error("Could not prepare notifications.");
  const { publicKey } = (await keyResponse.json()) as { publicKey: string };
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));
  const response = await fetch(`${API_ROOT}/web-push/subscriptions`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...subscription.toJSON(),
      deviceLabel: navigator.userAgent,
    }),
  });
  if (!response.ok) {
    await subscription.unsubscribe();
    throw new Error("HomeHub could not save this phone's notification setting.");
  }
  return subscription;
}

export async function disableWebPush(): Promise<void> {
  const subscription = await getCurrentWebPushSubscription();
  if (!subscription) return;
  await fetch(`${API_ROOT}/web-push/subscriptions`, {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  await subscription.unsubscribe();
}