/** Done and total tasks that roll up into a goal or milestone (canceled tasks don't count). */
export type Progress = { done: number; total: number };

export type GoalMilestone = { id: string; name: string; dueAt: string | null; progress: Progress };

export type Goal = {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  targetAt: string | null;
  archived: boolean;
  milestones: GoalMilestone[];
  /** Every task linked to the goal, with or without a milestone. */
  progress: Progress;
};

/** Whole-number percent done; 0 with nothing to do. */
export function percent({ done, total }: Progress) {
  return total ? Math.round((done / total) * 100) : 0;
}

export type GoalState = "done" | "overdue" | "open" | "empty";

/**
 * Where a goal or milestone stands: done once every linked task is, overdue
 * when its date's day has passed with work left, empty with nothing linked.
 */
export function goalState(progress: Progress, dueAt: string | null, now: Date): GoalState {
  if (!progress.total) return "empty";
  if (progress.done === progress.total) return "done";
  if (dueAt) {
    const due = new Date(dueAt);
    const endOfDay = new Date(due.getFullYear(), due.getMonth(), due.getDate() + 1);
    if (now >= endOfDay) return "overdue";
  }
  return "open";
}

/**
 * Sums task counts into a goal and its milestones. Rows are grouped by
 * milestone (null for tasks on the goal directly); rows for a milestone that
 * no longer exists still count toward the goal.
 */
export function rollUp(milestoneIds: string[], rows: Array<{ milestoneId: string | null; done: number; total: number }>) {
  const byMilestone = new Map<string, Progress>(milestoneIds.map((id) => [id, { done: 0, total: 0 }]));
  const goal: Progress = { done: 0, total: 0 };
  for (const row of rows) {
    goal.done += row.done;
    goal.total += row.total;
    const milestone = row.milestoneId ? byMilestone.get(row.milestoneId) : undefined;
    if (milestone) {
      milestone.done += row.done;
      milestone.total += row.total;
    }
  }
  return { goal, byMilestone };
}
