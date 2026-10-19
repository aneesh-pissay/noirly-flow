"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Pause, Play, Square, Timer } from "lucide-react";
import { useFocusStore } from "@/src/features/focus/focus-store";
import { BREAK_MINUTES, FOCUS_PRESETS, formatClock, remainingMs } from "@/src/features/focus/focus";

/** The current second while a session runs (and nothing while it doesn't). */
function useNowSecond(active: boolean) {
  return useSyncExternalStore(
    (notify) => {
      if (!active) return () => {};
      const timer = window.setInterval(notify, 1000);
      return () => window.clearInterval(timer);
    },
    () => (active ? Math.floor(Date.now() / 1000) : 0),
    () => 0,
  );
}

/** Asks once, on a click, whether the browser may show a "time's up" notification. */
function askForNotifications() {
  try {
    if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
  } catch {
    /* Not available here; the timer works without it. */
  }
}

function notify(title: string, body: string) {
  try {
    if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body });
  } catch {
    /* The in-page message still says it. */
  }
}

/** Drawer: start a focus session on this task. */
export function StartFocus({ task }: { task: { id: string; workspaceId: string; title: string } }) {
  const start = useFocusStore((state) => state.start);
  const current = useFocusStore((state) => state.session);
  const [minutes, setMinutes] = useState<number>(25);
  const running = current?.taskId === task.id;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Focus length" value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}
        className="h-9 rounded-lg border border-[var(--hairline)] bg-[var(--surface)] px-2 text-sm text-[var(--foreground)]">
        {FOCUS_PRESETS.map((m) => <option key={m} value={m}>{m} min</option>)}
      </select>
      <button type="button" onClick={() => { askForNotifications(); start(task, minutes); }}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--accent)] px-3 text-sm text-[var(--accent)] hover:bg-[var(--accent-soft)]">
        <Timer size={14} aria-hidden />{running ? "Restart focus" : "Start focus"}
      </button>
      {current && !running ? <span className="text-xs text-[var(--muted-foreground)]">Replaces the timer on “{current.title}”.</span> : null}
    </div>
  );
}

/**
 * The floating timer for the current focus session: pause, resume or stop;
 * when it runs out, a notification (if allowed) and the offer of a break.
 */
export function FocusTimer() {
  const { session, hydrate, pause, resume, stop, start } = useFocusStore();
  useEffect(() => hydrate(), [hydrate]);
  const running = Boolean(session?.endsAt);
  const nowSecond = useNowSecond(running);
  // A paused session holds its remainder, so the time only matters while running.
  const left = session ? remainingMs(session, nowSecond * 1000) : 0;
  const finished = Boolean(session && left === 0);

  // Tell the person once, when this session reaches zero.
  const told = useRef<string | null>(null);
  const key = session ? `${session.taskId}:${session.phase}:${session.durationMs}:${session.endsAt}` : null;
  useEffect(() => {
    if (!session || !finished || told.current === key) return;
    told.current = key;
    notify(session.phase === "focus" ? "Focus session done" : "Break's over", session.title);
  }, [finished, key, session]);

  if (!session) return null;
  const task = { id: session.taskId, workspaceId: session.workspaceId, title: session.title };
  return (
    <div role="region" aria-label="Focus timer"
      className="fixed bottom-4 right-4 z-50 w-64 rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-3 shadow-xl">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
        {session.phase === "focus" ? "Focus" : "Break"}{!running && !finished ? " · paused" : ""}
      </p>
      <Link href={`/w/${session.workspaceId}/t/${session.taskId}`} className="block truncate text-sm text-[var(--foreground)] hover:underline">
        {session.title}
      </Link>
      {finished ? (
        <div className="mt-2 space-y-2">
          <p role="status" className="text-sm font-medium text-[var(--foreground)]">
            {session.phase === "focus" ? "Focus session done." : "Break's over."}
          </p>
          <div className="flex flex-wrap gap-2">
            {session.phase === "focus" ? (
              <button type="button" onClick={() => start(task, BREAK_MINUTES, "break")}
                className="h-8 rounded-lg bg-[var(--accent)] px-3 text-xs text-[var(--accent-ink)]">{BREAK_MINUTES}-min break</button>
            ) : (
              <button type="button" onClick={() => start(task, 25)}
                className="h-8 rounded-lg bg-[var(--accent)] px-3 text-xs text-[var(--accent-ink)]">Focus again</button>
            )}
            <button type="button" onClick={stop} className="h-8 rounded-lg border border-[var(--hairline)] px-3 text-xs">Done</button>
          </div>
        </div>
      ) : (
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="font-mono text-2xl tabular-nums text-[var(--foreground)]" aria-label="Time left" aria-live="off">{formatClock(left)}</p>
          <div className="flex gap-1">
            {running ? (
              <button type="button" aria-label="Pause" onClick={pause} className="grid size-8 place-items-center rounded-lg border border-[var(--hairline)]"><Pause size={14} aria-hidden /></button>
            ) : (
              <button type="button" aria-label="Resume" onClick={resume} className="grid size-8 place-items-center rounded-lg border border-[var(--hairline)]"><Play size={14} aria-hidden /></button>
            )}
            <button type="button" aria-label="Stop" onClick={stop} className="grid size-8 place-items-center rounded-lg border border-[var(--hairline)]"><Square size={14} aria-hidden /></button>
          </div>
        </div>
      )}
    </div>
  );
}
