import { useCallback, useRef } from "react";
import { useClerk } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveMember } from "@/context/ActiveMemberContext";

const HOMEHUB_CACHE_PREFIX = "homehub-web-";
const HOMEHUB_LOCAL_STORAGE_KEYS = [
  "homehub-preferences",
  "homehub.workouts.experience.v1",
];
const HOMEHUB_SESSION_STORAGE_KEYS = ["homehub_invite_token"];
const LOGOUT_CACHE_BUSTER_PARAM = "homehub_logout";
const SERVICE_WORKER_ACTIVATION_TIMEOUT_MS = 3_000;

function removeKnownHomeHubStorage(): void {
  try {
    HOMEHUB_LOCAL_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
    HOMEHUB_SESSION_STORAGE_KEYS.forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    // Storage can be unavailable (for example, in private browsing). Sign-out
    // must not depend on it.
  }
}

async function clearHomeHubCaches(): Promise<void> {
  if (!("caches" in window)) return;

  const cacheNames = await window.caches.keys();
  await Promise.all(
    cacheNames
      .filter((name) => name.startsWith(HOMEHUB_CACHE_PREFIX))
      .map((name) => window.caches.delete(name)),
  );
}

async function updateHomeHubServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;

  const registration = await navigator.serviceWorker.register(
    `${import.meta.env.BASE_URL}sw.js`,
    {
      scope: import.meta.env.BASE_URL,
      updateViaCache: "none",
    },
  );
  await registration.update();

  const installingWorker = registration.installing;
  if (installingWorker && installingWorker.state !== "installed" && installingWorker.state !== "activated") {
    await new Promise<void>((resolve) => {
      const timeoutId = window.setTimeout(resolve, SERVICE_WORKER_ACTIVATION_TIMEOUT_MS);
      const onStateChange = () => {
        if (
          installingWorker.state === "installed"
          || installingWorker.state === "activated"
          || installingWorker.state === "redundant"
        ) {
          window.clearTimeout(timeoutId);
          installingWorker.removeEventListener("statechange", onStateChange);
          resolve();
        }
      };
      installingWorker.addEventListener("statechange", onStateChange);
    });
  }

  const waitingWorker = registration.waiting
    ?? (installingWorker?.state === "installed" ? installingWorker : null);
  if (!waitingWorker) return;

  const controllerChanged = new Promise<void>((resolve) => {
    const timeoutId = window.setTimeout(resolve, SERVICE_WORKER_ACTIVATION_TIMEOUT_MS);
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.clearTimeout(timeoutId);
      resolve();
    }, { once: true });
  });
  waitingWorker.postMessage({ type: "SKIP_WAITING" });
  await controllerChanged;
}

function logoutRedirectUrl(): string {
  const redirect = new URL(import.meta.env.BASE_URL, window.location.origin);
  const nonce = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  redirect.searchParams.set(LOGOUT_CACHE_BUSTER_PARAM, nonce);
  return redirect.toString();
}

/**
 * The only HomeHub Web sign-out path. It deliberately limits browser cleanup
 * to keys and cache names owned by this artifact, leaving Clerk and sibling
 * artifacts on the origin untouched.
 */
export function useHomeHubSignOut() {
  const { signOut } = useClerk();
  const queryClient = useQueryClient();
  const { setActiveMember } = useActiveMember();
  const signingOut = useRef(false);

  return useCallback(async () => {
    if (signingOut.current) return;
    signingOut.current = true;

    setActiveMember(null);
    queryClient.clear();
    removeKnownHomeHubStorage();

    // Updates and cache cleanup are best-effort, but finish their attempts
    // before Clerk navigates away.
    await Promise.allSettled([
      updateHomeHubServiceWorker(),
      clearHomeHubCaches(),
    ]);

    try {
      await signOut({ redirectUrl: logoutRedirectUrl() });
    } finally {
      // If Clerk rejects without navigating, allow the user to try again.
      signingOut.current = false;
    }
  }, [queryClient, setActiveMember, signOut]);
}