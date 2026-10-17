import type { Task } from "@/src/core/sync/types";
import { dueTone, endOfDay, isoToDateInput, startOfDay } from "@/src/features/task/dates";

export type AgendaMode = "today" | "upcoming";

/** How many days ahead Upcoming looks, starting tomorrow. */
export const UPCOMING_DAYS = 14;
const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 } as const;

/** The day's all-day tasks first, then timed ones by time; then priority, then title. */
function byDayOrder(a: Task, b: Task) {
  if (a.dueHasTime !== b.dueHasTime) return a.dueHasTime ? 1 : -1;
  if (a.dueHasTime) {
    const byTime = Date.parse(a.dueAt ?? "") - Date.parse(b.dueAt ?? "");
    if (byTime) return byTime;
  }
  return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.title.localeCompare(b.title);
}

/** The local-day range a mode covers, as ISO instants. */
export function agendaRange(mode: AgendaMode, now = new Date()) {
  if (mode === "today") return { dueBefore: endOfDay(now).toISOString() };
  const tomorrow = startOfDay(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const last = endOfDay(now);
  last.setDate(last.getDate() + UPCOMING_DAYS);
  return { dueAfter: tomorrow.toISOString(), dueBefore: last.toISOString() };
}

/** Sections to show: Overdue + Today, or one per upcoming day that has tasks. */
export function agendaSections(mode: AgendaMode, tasks: Task[], now = new Date()) {
  const sorted = [...tasks].sort((a, b) => Date.parse(a.dueAt ?? "") - Date.parse(b.dueAt ?? "") || byDayOrder(a, b));
  if (mode === "today") {
    const overdue = sorted.filter((task) => dueTone(task.dueAt, task.dueHasTime, now) === "overdue");
    const today = sorted.filter((task) => !overdue.includes(task)).sort(byDayOrder);
    return [
      ...(overdue.length ? [{ key: "overdue", label: "Overdue", tasks: overdue }] : []),
      ...(today.length ? [{ key: "today", label: "Today", tasks: today }] : []),
    ];
  }
  const days = new Map<string, Task[]>();
  for (const task of sorted) {
    const key = isoToDateInput(task.dueAt);
    days.set(key, [...(days.get(key) ?? []), task]);
  }
  const format = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" });
  const tomorrowKey = isoToDateInput(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString());
  return [...days.entries()].map(([key, list]) => {
    const [y, m, d] = key.split("-").map(Number);
    const date = format.format(new Date(y!, m! - 1, d));
    return { key, label: key === tomorrowKey ? `Tomorrow · ${date}` : date, tasks: list.sort(byDayOrder) };
  });
}

