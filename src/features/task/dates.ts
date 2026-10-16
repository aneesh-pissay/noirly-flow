export type DuePreset = "overdue" | "today" | "upcoming" | "none";

export type DueTone = "overdue" | "today" | "upcoming" | "none";

export function dateInputToIso(value: string): string | null {
  return dueInputToIso(value, "");
}

/**
 * A date input plus an optional "HH:MM" time input, as an ISO instant in the
 * browser's time zone. Without a time the task is all-day and is stored at
 * local noon, so it lands on the same calendar day in any nearby zone.
 */
export function dueInputToIso(date: string, time: string): string | null {
  if (!date) return null;
  const clock = /^\d{2}:\d{2}$/.test(time) ? `${time}:00` : "12:00:00";
  const local = new Date(`${date}T${clock}`);
  if (Number.isNaN(local.getTime())) return null;
  return local.toISOString();
}

/** "HH:MM" in local time for a timed due date; "" for none or all-day. */
export function isoToTimeInput(value: string | null | undefined, hasTime: boolean): string {
  if (!value || !hasTime) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** "3:30 PM" style, in the viewer's locale. */
export function formatTime(value: string | Date): string {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function isoToDateInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function startOfDay(date = new Date()) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function endOfDay(date = new Date()) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

/** Durations offered in pickers, in minutes. */
export const DURATION_PRESETS = [15, 30, 45, 60, 90, 120, 180, 240, 360, 480] as const;

/** "45m", "1h", "1h 30m". */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/** True when an all-day start date is after today: the task hasn't started yet. */
export function startsLater(startAt: string | null | undefined, now = new Date()): boolean {
  if (!startAt) return false;
  return startOfDay(new Date(startAt)).getTime() > startOfDay(now).getTime();
}

/** A start date ("YYYY-MM-DD") after the due date's day is not allowed; both are optional. */
export function startAfterDue(startDate: string, dueDate: string): boolean {
  return Boolean(startDate && dueDate && startDate > dueDate);
}

/** A timed task is overdue once its time passes; an all-day one only the next day. */
export function dueTone(
  dueAt: string | null | undefined,
  hasTime = false,
  now = new Date(),
): DueTone | null {
  if (!dueAt) return null;
  const instant = new Date(dueAt);
  if (hasTime && instant.getTime() < now.getTime()) return "overdue";
  const due = startOfDay(instant).getTime();
  const today = startOfDay(now).getTime();
  if (due < today) return "overdue";
  if (due === today) return "today";
  return "upcoming";
}

export function formatDue(dueAt: string | null | undefined, hasTime = false): string | null {
  if (!dueAt) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(hasTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(new Date(dueAt));
}

export function dueRange(preset: DuePreset | "" | undefined): {
  dueAfter?: string;
  dueBefore?: string;
  unscheduled?: boolean;
} {
  if (!preset) return {};
  const todayStart = startOfDay();
  const todayEnd = endOfDay();
  const tomorrowStart = startOfDay();
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  switch (preset) {
    case "overdue":
      return { dueBefore: todayStart.toISOString() };
    case "today":
      return {
        dueAfter: todayStart.toISOString(),
        dueBefore: todayEnd.toISOString(),
      };
    case "upcoming":
      return { dueAfter: tomorrowStart.toISOString() };
    case "none":
      return { unscheduled: true };
  }
}

export function dueClassName(tone: DueTone | null): string {
  if (tone === "overdue") return "bg-[var(--accent-soft)] px-1 text-[var(--accent)]";
  if (tone === "today") return "text-[var(--foreground)]";
  return "text-[var(--muted-foreground)]";
}
