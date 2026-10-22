import { useSyncExternalStore } from "react";

/**
 * Whether Flow is working from saved copies. True when the browser says it's
 * offline, a request couldn't reach the server, or the service worker
 * answered from its cache; false again on the next answer from the server.
 */
let offline = false;
const listeners = new Set<() => void>();

export function setOffline(next: boolean) {
  if (next === offline) return;
  offline = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const goOffline = () => setOffline(true);
  const goOnline = () => setOffline(false);
  window.addEventListener("offline", goOffline);
  window.addEventListener("online", goOnline);
  if (!navigator.onLine) setOffline(true);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("offline", goOffline);
    window.removeEventListener("online", goOnline);
  };
}

export function useOfflineState() {
  return useSyncExternalStore(subscribe, () => offline, () => false);
}

/** Reads a response for the offline signal: a saved copy means the server wasn't reached. */
export function noteResponse(response: Response) {
  setOffline(response.headers.get("X-Flow-From-Cache") === "1");
}

/** The caches that hold one person's pages and data (not the app's own files). */
const USER_CACHES = /^flow-(pages|data)-/;

/** Deletes saved pages and data, so the next person on this browser can't read them. */
export async function clearOfflineData() {
  try {
    if (!("caches" in window)) return;
    for (const key of await caches.keys()) {
      if (USER_CACHES.test(key)) await caches.delete(key);
    }
  } catch {
    // Storage blocked or unavailable: nothing was saved either.
  }
}

/** Registers the service worker once per page load (production builds only). */
export function registerServiceWorker() {
  if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
    console.error("Service worker registration failed; Flow works online only.");
  });
}
