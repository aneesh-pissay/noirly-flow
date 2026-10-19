import type { Task } from "@/src/core/sync/types";

export type MoveTarget = "tomorrow" | "next-week" | "none";

const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayValue = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());

/** Tomorrow, or next Monday, as a local day. */
export function targetDay(target: Exclude<MoveTarget, "none">, now: Date) {
  const today = startOf(now);
  if (target === "tomorrow") return new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const toMonday = ((8 - today.getDay()) % 7) || 7;
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() + toMonday);
}

/**
 * The due date to save when moving a task in a review: onto tomorrow or next
 * Monday, keeping its time of day if it had one (all-day stays at noon), or
 * cleared.
 */
export function movedDue(task: Pick<Task, "dueAt" | "dueHasTime">, target: MoveTarget, now: Date): Pick<Task, "dueAt" | "dueHasTime"> {
  if (target === "none") return { dueAt: null, dueHasTime: false };
  const day = targetDay(target, now);
  const old = task.dueAt ? new Date(task.dueAt) : null;
  const timed = Boolean(old && task.dueHasTime);
  const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), timed ? old!.getHours() : 12, timed ? old!.getMinutes() : 0);
  return { dueAt: at.toISOString(), dueHasTime: timed };
}

/** Tasks assigned to me, or unassigned ones I created. */
export function isMine(task: Pick<Task, "assigneeIds" | "createdById">, meId: string) {
  return task.assigneeIds.includes(meId) || (!task.assigneeIds.length && task.createdById === meId);
}

/** Open tasks by when they're due, relative to `now` (local days). */
export function groupOpen(tasks: Task[], now: Date) {
  const today = dayValue(now);
  const tomorrow = today + 86_400_000;
  const nextMonday = dayValue(targetDay("next-week", now));
  const weekAfter = nextMonday + 7 * 86_400_000;
  const groups = { overdue: [] as Task[], today: [] as Task[], tomorrow: [] as Task[], nextWeek: [] as Task[], undated: [] as Task[] };
  for (const task of tasks) {
    if (!task.dueAt) { groups.undated.push(task); continue; }
    const due = dayValue(new Date(task.dueAt));
    const late = task.dueHasTime ? Date.parse(task.dueAt) < now.getTime() : due < today;
    if (late) groups.overdue.push(task);
    else if (due === today) groups.today.push(task);
    else if (due === tomorrow) groups.tomorrow.push(task);
    if (due >= nextMonday && due < weekAfter) groups.nextWeek.push(task);
  }
  const byDue = (a: Task, b: Task) => Date.parse(a.dueAt ?? "") - Date.parse(b.dueAt ?? "");
  for (const list of Object.values(groups)) list.sort(byDue);
  return groups;
}
