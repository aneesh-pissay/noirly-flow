import type { TaskStatus } from "@/src/core/models/enums";

/** One occurrence of a habit: a task in its repeating series. */
export type Occurrence = { id: string; dueAt: string | null; completedAt: string | null; status: TaskStatus };

/**
 * on-time: done by its due day. late: done after it. overdue: still open
 * after its due day. open: not due yet (or due today). skipped: canceled,
 * which neither counts nor breaks a streak.
 */
export type OccurrenceState = "on-time" | "late" | "overdue" | "open" | "skipped";

const dayValue = (iso: string) => {
  const d = new Date(iso);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
};

export function occurrenceState(o: Occurrence, now: Date): OccurrenceState {
  if (o.status === "canceled") return "skipped";
  if (o.status === "done") {
    if (!o.dueAt || !o.completedAt) return "on-time";
    return dayValue(o.completedAt) <= dayValue(o.dueAt) ? "on-time" : "late";
  }
  return o.dueAt && dayValue(o.dueAt) < dayValue(now.toISOString()) ? "overdue" : "open";
}

/**
 * A habit's streaks, in local days. Current: on-time occurrences in a row up
 * to now, broken by one done late or one left overdue. Best: the longest such
 * run ever. History: each occurrence's state, oldest first.
 */
export function habitStats(occurrences: Occurrence[], now = new Date()) {
  const ordered = [...occurrences].sort((a, b) =>
    (a.dueAt ? Date.parse(a.dueAt) : Date.parse(a.completedAt ?? "") || 0) - (b.dueAt ? Date.parse(b.dueAt) : Date.parse(b.completedAt ?? "") || 0));
  const history = ordered.map((o) => ({ id: o.id, dueAt: o.dueAt, state: occurrenceState(o, now) }));

  let best = 0;
  let run = 0;
  for (const { state } of history) {
    if (state === "on-time") best = Math.max(best, ++run);
    else if (state === "late" || state === "overdue") run = 0;
  }

  let current = 0;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const { state } = history[i]!;
    if (state === "on-time") current += 1;
    else if (state === "late" || state === "overdue") break;
  }
  return { current, best, history };
}
