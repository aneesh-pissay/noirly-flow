"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@noirly-dev/ui";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const noSubscribe = () => () => {};
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

/** Settings → Install: the browser's install prompt where it has one, and how-to text where it doesn't. */
export function InstallAppSection() {
  const installed = useSyncExternalStore(noSubscribe, standalone, () => false);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const capture = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const finished = () => { setDone(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", finished);
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", finished);
    };
  }, []);

  return (
    <section aria-labelledby="install-title" className="border border-[var(--hairline)] bg-[var(--surface)] p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">App</p>
      <h2 id="install-title" className="mt-1 text-sm font-medium text-[var(--foreground)]">Install Flow</h2>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">
        Run Flow in its own window from your dock, start menu or home screen. Pages you&apos;ve opened stay readable offline;
        changes need a connection.
      </p>
      {installed || done ? (
        <p className="mt-3 text-sm text-[var(--foreground)]">Flow is installed on this device.</p>
      ) : prompt ? (
        <Button type="button" className="mt-3" onClick={async () => {
          await prompt.prompt();
          if ((await prompt.userChoice).outcome === "accepted") setDone(true);
          setPrompt(null);
        }}>
          Install app
        </Button>
      ) : (
        <p className="mt-3 text-xs text-[var(--muted-foreground)]">
          In Chrome or Edge, use the install icon in the address bar. On iPhone or iPad, tap Share, then Add to Home Screen.
          In Safari on a Mac, choose File, then Add to Dock.
        </p>
      )}
    </section>
  );
}
