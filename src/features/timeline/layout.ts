import type { Task } from "@/src/core/sync/types";

/** A timed task with no duration is drawn this long. */
export const DEFAULT_BLOCK_MINUTES = 30;
const DAY_MINUTES = 24 * 60;

export type TimelineMode = "day" | "week";

/** Local midnight of a date. */
export function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** The days shown: the anchor day, or the Monday-to-Sunday week around it. */
export function visibleDays(mode: TimelineMode, anchor: Date): Date[] {
  const day = startOfLocalDay(anchor);
  if (mode === "day") return [day];
  const monday = addDays(day, -((day.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** The ISO range covering those days, for the task list query. */
export function visibleRange(days: Date[]) {
  const last = days[days.length - 1]!;
  return { dueAfter: days[0]!.toISOString(), dueBefore: new Date(addDays(last, 1).getTime() - 1).toISOString() };
}

export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export type TimelineBlock = {
  task: Task;
  /** Minutes from the day's midnight. */
  start: number;
  end: number;
  /** Side-by-side position among overlapping blocks. */
  lane: number;
  lanes: number;
};

/**
 * One day's timed tasks as blocks: from the due time for the task's duration,
 * clipped to the day. Overlapping blocks share the width, each group getting
 * as many lanes as it needs at its busiest.
 */
export function layoutDay(tasks: Task[], day: Date): TimelineBlock[] {
  const blocks = tasks
    .filter((task) => task.dueAt && task.dueHasTime && sameDay(new Date(task.dueAt), day))
    .map((task) => {
      const due = new Date(task.dueAt!);
      const start = due.getHours() * 60 + due.getMinutes();
      const end = Math.min(DAY_MINUTES, start + (task.durationMinutes || DEFAULT_BLOCK_MINUTES));
      return { task, start, end, lane: 0, lanes: 1 };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);

  // Sweep into groups of blocks that overlap one another, then pack lanes per group.
  let group: TimelineBlock[] = [];
  let groupEnd = -1;
  const finish = () => {
    const laneEnds: number[] = [];
    for (const block of group) {
      let lane = laneEnds.findIndex((end) => end <= block.start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = block.end;
      block.lane = lane;
    }
    for (const block of group) block.lanes = laneEnds.length;
  };
  for (const block of blocks) {
    if (group.length && block.start >= groupEnd) { finish(); group = []; }
    group.push(block);
    groupEnd = Math.max(groupEnd, block.end);
  }
  if (group.length) finish();
  return blocks;
}

/** That day's tasks with a date but no time, for the all-day strip. */
export function allDayTasks(tasks: Task[], day: Date) {
  return tasks.filter((task) => task.dueAt && !task.dueHasTime && sameDay(new Date(task.dueAt), day));
}
