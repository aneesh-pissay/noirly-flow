import type { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { Task } from "@/src/server/models";

/** Levels below a top-level task, so four levels in all. */
export const MAX_SUBTASK_DEPTH = 3;
/** A ceiling on any one subtree, so a walk can't run away. */
const MAX_DESCENDANTS = 500;

/** Every task below `rootId` (children, their children, …), live or not per `filter`. */
export async function descendantIds(rootId: Types.ObjectId, filter: Record<string, unknown> = { deletedAt: null }) {
  const found: Types.ObjectId[] = [];
  let frontier = [rootId];
  for (let level = 0; frontier.length && level <= MAX_SUBTASK_DEPTH + 1; level += 1) {
    const children = await Task.find({ parentTaskId: { $in: frontier }, ...filter }).select("_id").lean();
    frontier = children.map((child) => child._id);
    found.push(...frontier);
    if (found.length > MAX_DESCENDANTS) break;
  }
  return found;
}

/** How many levels below the top a task sits (a top-level task is 0). */
async function depthOf(taskId: Types.ObjectId) {
  let depth = 0;
  let current = await Task.findById(taskId).select("parentTaskId").lean();
  while (current?.parentTaskId && depth <= MAX_SUBTASK_DEPTH + 1) {
    depth += 1;
    current = await Task.findById(current.parentTaskId).select("parentTaskId").lean();
  }
  return depth;
}

/** How many levels of subtasks hang below a task (none is 0). */
async function heightOf(taskId: Types.ObjectId) {
  let height = 0;
  let frontier = [taskId];
  while (height <= MAX_SUBTASK_DEPTH + 1) {
    const children = await Task.find({ parentTaskId: { $in: frontier }, deletedAt: null }).select("_id").lean();
    if (!children.length) break;
    height += 1;
    frontier = children.map((child) => child._id);
  }
  return height;
}

/**
 * Refuses a parent that would make a loop (a task under its own subtask) or
 * nest deeper than four levels, counting the task's own subtasks when it moves.
 */
export async function assertParentAllowed(parentId: Types.ObjectId, taskId?: Types.ObjectId) {
  if (taskId) {
    let current = await Task.findById(parentId).select("parentTaskId").lean();
    for (let i = 0; current && i <= MAX_SUBTASK_DEPTH + 1; i += 1) {
      if (String(current._id) === String(taskId)) throw new ApiError(403, "forbidden", "A task can't go under its own subtask");
      current = current.parentTaskId ? await Task.findById(current.parentTaskId).select("parentTaskId").lean() : null;
    }
  }
  const depth = (await depthOf(parentId)) + 1 + (taskId ? await heightOf(taskId) : 0);
  if (depth > MAX_SUBTASK_DEPTH) throw new ApiError(400, "too_deep", "Subtasks can go four levels deep");
}

/** Done and total direct subtasks (canceled ones not counted) for each of `parentIds`. */
export async function subtaskCounts(parentIds: Types.ObjectId[]) {
  if (!parentIds.length) return new Map<string, { done: number; total: number }>();
  const rows = await Task.aggregate<{ _id: Types.ObjectId; total: number; done: number }>([
    { $match: { parentTaskId: { $in: parentIds }, deletedAt: null, status: { $ne: "canceled" } } },
    { $group: { _id: "$parentTaskId", total: { $sum: 1 }, done: { $sum: { $cond: [{ $eq: ["$status", "done"] }, 1, 0] } } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), { done: row.done, total: row.total }]));
}
