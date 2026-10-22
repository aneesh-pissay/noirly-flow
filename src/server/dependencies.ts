import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { Task } from "@/src/server/models";
import type { Task as TaskDto } from "@/src/core/sync/types";

/** Tasks one task can wait on. */
export const MAX_BLOCKERS = 20;
/** How far a loop check walks before giving up (generously). */
const MAX_WALK = 500;
const OPEN: Array<"todo" | "in_progress"> = ["todo", "in_progress"];

/** Which of `ids` are still open (not done, canceled or deleted). */
export async function openTaskIds(ids: Array<Types.ObjectId | string>): Promise<Set<string>> {
  const unique = [...new Set(ids.map(String))];
  if (!unique.length) return new Set();
  const open = await Task.find({ _id: { $in: unique.map((id) => new Types.ObjectId(id)) }, deletedAt: null, status: { $in: OPEN } })
    .select("_id").lean();
  return new Set(open.map((task) => String(task._id)));
}

/** Sets `blocked` on each task that waits on an open task. */
export async function withBlocked<T extends TaskDto>(tasks: T[]): Promise<T[]> {
  const open = await openTaskIds(tasks.flatMap((task) => task.blockedByIds));
  return tasks.map((task) => (task.blockedByIds.some((id) => open.has(id)) ? { ...task, blocked: true } : task));
}

/**
 * Blockers must be live tasks in the same workspace, not the task itself, and
 * mustn't make a loop (A waits on B waits on A).
 */
export async function assertBlockersAllowed(workspaceId: Types.ObjectId, blockerIds: string[], taskId?: Types.ObjectId) {
  const unique = [...new Set(blockerIds)];
  if (unique.length > MAX_BLOCKERS) throw new ApiError(400, "too_many", `A task can wait on up to ${MAX_BLOCKERS} others`);
  if (!unique.length) return;
  if (taskId && unique.includes(String(taskId))) throw new ApiError(400, "invalid_request", "A task can't block itself");
  const ids = unique.map((id) => new Types.ObjectId(id));
  if (await Task.countDocuments({ _id: { $in: ids }, workspaceId, deletedAt: null }) !== ids.length) {
    throw new ApiError(403, "forbidden", "A blocking task isn't in this workspace");
  }
  if (!taskId) return;
  // Walk what the new blockers wait on; reaching this task means a loop.
  const seen = new Set<string>();
  let frontier = ids;
  while (frontier.length && seen.size < MAX_WALK) {
    const rows = await Task.find({ _id: { $in: frontier }, deletedAt: null }).select("blockedByIds").lean();
    const next: Types.ObjectId[] = [];
    for (const row of rows) {
      for (const id of row.blockedByIds ?? []) {
        if (String(id) === String(taskId)) throw new ApiError(400, "dependency_loop", "That would make the tasks wait on each other");
        if (!seen.has(String(id))) { seen.add(String(id)); next.push(id); }
      }
    }
    frontier = next;
  }
}

/** Refuses to finish a task while something it waits on is still open. */
export async function assertNotBlocked(blockerIds: Array<Types.ObjectId | string>, title: string) {
  if ((await openTaskIds(blockerIds)).size) {
    throw new ApiError(409, "blocked", `“${title}” is waiting on other tasks; finish those first`);
  }
}

/** Tasks that wait on `taskId`, for the drawer's "Blocking" list. */
export async function blockedTasksOf(taskId: Types.ObjectId) {
  return Task.find({ blockedByIds: taskId, deletedAt: null }).select("title status projectId workspaceId").limit(50).lean();
}
