import type { Task } from "@/src/core/sync/types";

const DAY_MS = 86_400_000;

/** A local calendar day as a whole number (days since 1970-01-01), immune to DST. */
export function dayNumber(date: Date | string): number {
  const d = typeof date === "string" ? new Date(date) : date;
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
}

/** The local date for a day number. */
export function dayDate(day: number): Date {
  const utc = new Date(day * DAY_MS);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

export type GanttBar = {
  task: Task;
  /** First and last day it covers (inclusive), as day numbers. */
  start: number;
  end: number;
  deadline: number | null;
};

/**
 * Dated tasks as bars: from the start date (or the due date) to the due date
 * (or the start date), soonest first. Tasks with neither date are left out.
 */
export function ganttBars(tasks: Task[]): GanttBar[] {
  return tasks
    .flatMap((task): GanttBar[] => {
      if (!task.startAt && !task.dueAt) return [];
      const due = task.dueAt ? dayNumber(task.dueAt) : null;
      const begin = task.startAt ? dayNumber(task.startAt) : due!;
      const finish = due ?? begin;
      return [{
        task,
        start: Math.min(begin, finish),
        end: Math.max(begin, finish),
        deadline: task.deadlineAt ? dayNumber(task.deadlineAt) : null,
      }];
    })
    .sort((a, b) => a.start - b.start || a.end - b.end || a.task.title.localeCompare(b.task.title));
}

/** The days to draw: every bar and deadline plus today, padded, at least four weeks. */
export function ganttRange(bars: GanttBar[], today: number) {
  const points = [today, ...bars.flatMap((bar) => [bar.start, bar.end, ...(bar.deadline !== null ? [bar.deadline] : [])])];
  const first = Math.min(...points) - 3;
  const last = Math.max(Math.max(...points) + 7, first + 27);
  return { first, days: Math.min(last - first + 1, 400) };
}

/** Arrows from a blocker's bar to the bar of each task waiting on it (rows are bar indexes). */
export function ganttLinks(bars: GanttBar[]) {
  const row = new Map(bars.map((bar, index) => [bar.task.id, index]));
  return bars.flatMap((bar, index) =>
    bar.task.blockedByIds.flatMap((id) => {
      const from = row.get(id);
      return from === undefined ? [] : [{ from, to: index }];
    }));
}

/** The same moment `days` calendar days later, keeping the time of day. */
export function shiftIso(iso: string, days: number): string {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes(), d.getSeconds()).toISOString();
}

/** A day number at local noon, how all-day dates are stored. */
export function dayToIso(day: number): string {
  const d = dayDate(day);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).toISOString();
}

export type GanttDrag = "move" | "start" | "end";

/**
 * The task fields to save after dragging a bar by `delta` days: moving shifts
 * both dates (keeping a due time), the ends change one date, never past the other.
 */
export function ganttPatch(bar: GanttBar, kind: GanttDrag, delta: number): Partial<Pick<Task, "startAt" | "dueAt" | "dueHasTime">> {
  const { task } = bar;
  if (kind === "move") {
    return {
      ...(task.startAt ? { startAt: shiftIso(task.startAt, delta) } : {}),
      ...(task.dueAt ? { dueAt: shiftIso(task.dueAt, delta), dueHasTime: task.dueHasTime } : {}),
    };
  }
  if (kind === "start") {
    return { startAt: dayToIso(Math.min(bar.start + delta, bar.end)) };
  }
  const end = Math.max(bar.end + delta, bar.start);
  return task.dueAt
    ? { dueAt: shiftIso(task.dueAt, end - dayNumber(task.dueAt)), dueHasTime: task.dueHasTime }
    : { dueAt: dayToIso(end), dueHasTime: false };
}
