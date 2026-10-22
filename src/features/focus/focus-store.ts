"use client";

import { create } from "zustand";
import { pauseSession, resumeSession, startSession, type FocusPhase, type FocusSession } from "@/src/features/focus/focus";

const STORAGE_KEY = "noirly-flow:focus";

/** The saved session, if any; storage can be unavailable (private mode, blocked), which just means none. */
function load(): FocusSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as FocusSession) : null;
  } catch {
    return null;
  }
}

function save(session: FocusSession | null) {
  try {
    if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Not kept across reloads, but the timer still runs. */
  }
}

type FocusStore = {
  session: FocusSession | null;
  /** Reads the saved session once the page is in the browser. */
  hydrate: () => void;
  start: (task: { id: string; workspaceId: string; title: string }, minutes: number, phase?: FocusPhase) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
};

/**
 * The viewer's own focus timer: one at a time, kept in this browser so it
 * carries across pages and reloads. Not shared, and not sent anywhere.
 */
export const useFocusStore = create<FocusStore>((set, get) => {
  const update = (session: FocusSession | null) => { save(session); set({ session }); };
  return {
    session: null,
    hydrate: () => { if (!get().session) set({ session: load() }); },
    start: (task, minutes, phase = "focus") => update(startSession(task, minutes, Date.now(), phase)),
    pause: () => { const s = get().session; if (s) update(pauseSession(s, Date.now())); },
    resume: () => { const s = get().session; if (s) update(resumeSession(s, Date.now())); },
    stop: () => update(null),
  };
});
