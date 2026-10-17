import type { Task } from "@/src/core/sync/types";

/** Minutes available per weekday, Sunday first (as Date#getDay): 8 hours Monday to Friday. */
export const DEFAULT_CAPACITY = [0, 480, 480, 480, 480, 480, 0] as const;

/** A member's minutes per weekday, falling back to the default. */
export function capacityOf(minutes: readonly number[] | null | undefined): number[] {
  return minutes?.length === 7 ? [...minutes] : [...DEFAULT_CAPACITY];
}

/** "YYYY-MM-DD" for the local day. */
export function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export type DayLoad = {
  /** Estimated minutes of work due that day. */
  minutes: number;
  /** Tasks due that day with no duration, so not in `minutes`. */
  unestimated: number;
  tasks: Task[];
};

/**
 * Each person's open work per local day: the durations of open tasks assigned
 * to them and due that day. A task with several assignees counts in full for
 * each. Done, canceled and unassigned tasks don't count.
 */
export function workload(tasks: Task[], userIds: string[], days: Date[]): Map<string, Map<string, DayLoad>> {
  const keys = new Set(days.map(dayKey));
  const result = new Map(userIds.map((id) => [id, new Map(days.map((day) => [dayKey(day), { minutes: 0, unestimated: 0, tasks: [] as Task[] }]))]));
  for (const task of tasks) {
    if (!task.dueAt || (task.status !== "todo" && task.status !== "in_progress")) continue;
    const key = dayKey(new Date(task.dueAt));
    if (!keys.has(key)) continue;
    for (const userId of task.assigneeIds) {
      const load = result.get(userId)?.get(key);
      if (!load) continue;
      load.tasks.push(task);
      if (task.durationMinutes) load.minutes += task.durationMinutes;
      else load.unestimated += 1;
    }
  }
  return result;
}

/** Minutes over what's available that day (0 when within). */
export function overBy(load: DayLoad, capacity: number[], day: Date) {
  return Math.max(0, load.minutes - (capacity[day.getDay()] ?? 0));
}

/** "6h", "7h 30m", "45m", "0h". */
export function hoursLabel(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h && m) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}
