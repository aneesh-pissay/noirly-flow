/** Focus lengths offered, in minutes. */
export const FOCUS_PRESETS = [15, 25, 50] as const;
export const BREAK_MINUTES = 5;

export type FocusPhase = "focus" | "break";

/** A running or paused focus (or break) session on one task. */
export type FocusSession = {
  taskId: string;
  workspaceId: string;
  title: string;
  phase: FocusPhase;
  /** The phase's full length. */
  durationMs: number;
  /** When it ends, while running; null while paused. */
  endsAt: number | null;
  /** What's left, while paused; null while running. */
  remainingMs: number | null;
};

export function startSession(task: { id: string; workspaceId: string; title: string }, minutes: number, now: number, phase: FocusPhase = "focus"): FocusSession {
  const durationMs = minutes * 60_000;
  return { taskId: task.id, workspaceId: task.workspaceId, title: task.title, phase, durationMs, endsAt: now + durationMs, remainingMs: null };
}

export function remainingMs(session: FocusSession, now: number) {
  return session.endsAt !== null ? Math.max(0, session.endsAt - now) : Math.max(0, session.remainingMs ?? 0);
}

export function pauseSession(session: FocusSession, now: number): FocusSession {
  return session.endsAt === null ? session : { ...session, endsAt: null, remainingMs: remainingMs(session, now) };
}

export function resumeSession(session: FocusSession, now: number): FocusSession {
  return session.endsAt !== null ? session : { ...session, endsAt: now + (session.remainingMs ?? 0), remainingMs: null };
}

/** "24:59", or "1:05:00" past an hour. */
export function formatClock(ms: number) {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}
