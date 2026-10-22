"use client";

import { useEffect } from "react";
import { WifiOff } from "lucide-react";
import { registerServiceWorker, useOfflineState } from "@/src/lib/offline";

/** Registers the service worker, and says so when Flow is showing saved copies. */
export function OfflineBanner() {
  const offline = useOfflineState();
  useEffect(() => registerServiceWorker(), []);
  if (!offline) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 border-b border-[var(--hairline)] bg-[var(--surface-2)] px-4 py-2 text-center text-sm text-[var(--foreground)]">
      <WifiOff size={14} aria-hidden />
      You&apos;re offline. Showing what was last loaded on this device; changes can&apos;t be saved until you reconnect.
    </div>
  );
}
