/** A finished entry or the running timer, as the API returns it. */
export type TimeEntryView = {
  id: string;
  taskId: string;
  userId: string;
  userName: string;
  startedAt: string;
  /** Null while it's the running timer. */
  endedAt: string | null;
  /** Null while running. */
  minutes: number | null;
  note: string | null;
};

/** The longest one entry can be; a timer left running longer is cut here when stopped. */
export const MAX_ENTRY_MINUTES = 24 * 60;

/** Whole minutes between start and end: at least 1, at most a day. */
export function elapsedMinutes(startedAt: Date, endedAt: Date) {
  return Math.min(MAX_ENTRY_MINUTES, Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 60_000)));
}

/**
 * Reads what people type for a duration: "45", "45m", "1h", "1h 30m", "1.5h",
 * "1:30". Null when it isn't a duration between 1 minute and a day.
 */
export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return null;
  let minutes: number | null = null;
  let m: RegExpExecArray | null;
  if ((m = /^(\d{1,2}):([0-5]\d)$/.exec(text))) minutes = Number(m[1]) * 60 + Number(m[2]);
  else if ((m = /^(\d+(?:\.\d+)?) ?h(?:ours?|rs?)?(?: ?(\d{1,2}) ?m(?:in(?:utes?)?)?)?$/.exec(text))) minutes = Math.round(Number(m[1]) * 60) + Number(m[2] ?? 0);
  else if ((m = /^(\d+) ?(?:m|min|mins|minutes?)?$/.exec(text))) minutes = Number(m[1]);
  return minutes !== null && minutes >= 1 && minutes <= MAX_ENTRY_MINUTES ? minutes : null;
}

/** "1:05:09" / "12:04" stopwatch reading for a running timer. */
export function stopwatch(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
