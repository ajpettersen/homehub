import { createRoot } from 'react-dom/client';

import App from './App';

import './index.css';

const CACHE_BUSTER_PARAM = "homehub_logout";

// This script is executing only after the redirect document has been fetched.
// Remove the one-use URL cache buster without triggering another navigation.
const startupUrl = new URL(window.location.href);
if (startupUrl.searchParams.has(CACHE_BUSTER_PARAM)) {
  startupUrl.searchParams.delete(CACHE_BUSTER_PARAM);
  window.history.replaceState(null, "", `${startupUrl.pathname}${startupUrl.search}${startupUrl.hash}`);
}

createRoot(document.getElementById('root')!).render(<App />);

if ("serviceWorker" in navigator) {
  const updateServiceWorker = async () => {
    try {
      const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
        updateViaCache: "none",
      });
      await registration.update();
    } catch {
      // Offline/unsupported browsers still need to be able to use the app.
    }
  };

  window.addEventListener("load", () => void updateServiceWorker());
  document.addEventListener("visibilitychange", () => {
    const isInstalled = window.matchMedia("(display-mode: standalone)").matches
      || ("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true);
    if (document.visibilityState === "visible" && isInstalled) {
      void updateServiceWorker();
    }
  });
}
