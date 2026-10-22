import { Types } from "mongoose";
import { withDb } from "@/src/server/db/mongodb";
import { Task } from "@/src/server/models";
import { mapTask } from "@/src/server/mappers";
import { requireWorkspaceRole } from "@/src/server/workspace/members";
import type { Occurrence } from "@/src/core/habits";
import type { Task as TaskDto } from "@/src/core/sync/types";

/** Occurrences returned per habit, newest kept. */
const HISTORY = 60;
const OPEN = new Set(["todo", "in_progress"]);

export type HabitView = { seriesId: string; task: TaskDto; occurrences: Occurrence[] };

/**
 * The workspace's habits: each repeating series whose latest occurrence is
 * marked as a habit, with that occurrence (the open one if there is one) and
 * its history. Streaks are worked out in the browser, in the viewer's days.
 */
export function listHabits(userId: string, workspaceId: string) {
  return withDb(async (): Promise<HabitView[]> => {
    await requireWorkspaceRole(userId, workspaceId, "viewer");
    const ws = new Types.ObjectId(workspaceId);
    const marked = await Task.find({ workspaceId: ws, habit: true, deletedAt: null }).select("_id seriesId").lean();
    const seriesIds = [...new Set(marked.map((t) => String(t.seriesId ?? t._id)))].map((id) => new Types.ObjectId(id));
    if (!seriesIds.length) return [];
    const all = await Task.find({
      workspaceId: ws,
      deletedAt: null,
      $or: [{ _id: { $in: seriesIds } }, { seriesId: { $in: seriesIds } }],
    }).sort({ dueAt: -1, createdAt: -1 }).limit(seriesIds.length * HISTORY).lean();

    const bySeries = new Map<string, typeof all>();
    for (const task of all) {
      const key = String(task.seriesId ?? task._id);
      bySeries.set(key, [...(bySeries.get(key) ?? []), task]);
    }
    return [...bySeries.entries()].flatMap(([seriesId, tasks]) => {
      // Newest first: the open occurrence if there is one, else the latest.
      const current = tasks.find((t) => OPEN.has(t.status)) ?? tasks[0]!;
      if (!current.habit) return [];
      return [{
        seriesId,
        task: mapTask(current),
        occurrences: tasks.slice(0, HISTORY).map((t) => ({
          id: String(t._id),
          dueAt: t.dueAt ? t.dueAt.toISOString() : null,
          completedAt: t.completedAt ? t.completedAt.toISOString() : null,
          status: t.status,
        })),
      }];
    }).sort((a, b) => a.task.title.localeCompare(b.task.title));
  });
}
