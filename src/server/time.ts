import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { FlowUser, Task, TimeEntry, WorkspaceMembership, type TimeEntryDocument } from "@/src/server/models";
import { requireWorkspaceRole } from "@/src/server/workspace/members";
import { resolveFlowDisplayName } from "@/src/server/users/display-name";
import { elapsedMinutes, type TimeEntryView } from "@/src/core/time-tracking";

/** Entries shown per task (newest first). */
const LIST_LIMIT = 200;
type TaskRef = { id: string; workspaceId: string };

async function views(docs: TimeEntryDocument[]): Promise<TimeEntryView[]> {
  const users = await FlowUser.find({ _id: { $in: [...new Set(docs.map((d) => String(d.userId)))].map((id) => new Types.ObjectId(id)) } })
    .select("displayName profile.displayName").lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return docs.map((doc) => ({
    id: String(doc._id),
    taskId: String(doc.taskId),
    userId: String(doc.userId),
    userName: resolveFlowDisplayName(byId.get(String(doc.userId))),
    startedAt: doc.startedAt.toISOString(),
    endedAt: doc.endedAt ? doc.endedAt.toISOString() : null,
    minutes: doc.minutes ?? null,
    note: doc.note ?? null,
  }));
}

/** A task's entries, newest first, and the total of the finished ones. */
export function listTaskTime(task: TaskRef) {
  return withDb(async () => {
    const docs = await TimeEntry.find({ taskId: new Types.ObjectId(task.id) }).sort({ startedAt: -1 }).limit(LIST_LIMIT).lean();
    const [total] = await TimeEntry.aggregate<{ minutes: number }>([
      { $match: { taskId: new Types.ObjectId(task.id), endedAt: { $ne: null } } },
      { $group: { _id: null, minutes: { $sum: "$minutes" } } },
    ]);
    return { entries: await views(docs as TimeEntryDocument[]), totalMinutes: total?.minutes ?? 0 };
  });
}

/** A finished entry typed in by hand, ending now unless said otherwise. */
export function addTimeEntry(userId: string, task: TaskRef, input: { minutes: number; note?: string | null; endedAt?: Date }) {
  return withDb(async () => {
    await requireWorkspaceRole(userId, task.workspaceId, "member");
    const endedAt = input.endedAt ?? new Date();
    const doc = await TimeEntry.create({
      workspaceId: new Types.ObjectId(task.workspaceId),
      taskId: new Types.ObjectId(task.id),
      userId: new Types.ObjectId(userId),
      startedAt: new Date(endedAt.getTime() - input.minutes * 60_000),
      endedAt,
      minutes: input.minutes,
      note: input.note?.trim() || null,
    });
    return (await views([doc.toObject()]))[0]!;
  });
}

/** Finishes the person's running timer, if any; returns the finished entry. */
async function finishRunning(userId: string, now = new Date()) {
  const running = await TimeEntry.findOne({ userId: new Types.ObjectId(userId), endedAt: null });
  if (!running) return null;
  running.endedAt = now;
  running.minutes = elapsedMinutes(running.startedAt, now);
  await running.save();
  return running.toObject();
}

/** Starts a timer on a task, finishing whatever timer the person had running. */
export function startTimer(userId: string, task: TaskRef) {
  return withDb(async () => {
    await requireWorkspaceRole(userId, task.workspaceId, "member");
    await finishRunning(userId);
    const doc = await TimeEntry.create({
      workspaceId: new Types.ObjectId(task.workspaceId),
      taskId: new Types.ObjectId(task.id),
      userId: new Types.ObjectId(userId),
      startedAt: new Date(),
    });
    return (await views([doc.toObject()]))[0]!;
  });
}

export function stopTimer(userId: string) {
  return withDb(async () => {
    const finished = await finishRunning(userId);
    return finished ? (await views([finished]))[0]! : null;
  });
}

/** The person's running timer with its task, if they're still allowed to see it. */
export function runningTimer(userId: string) {
  return withDb(async () => {
    const doc = await TimeEntry.findOne({ userId: new Types.ObjectId(userId), endedAt: null }).lean();
    if (!doc) return null;
    const [task, member] = await Promise.all([
      Task.findOne({ _id: doc.taskId, deletedAt: null }).select("title workspaceId").lean(),
      WorkspaceMembership.exists({ workspaceId: doc.workspaceId, userId: doc.userId }),
    ]);
    if (!task || !member) return null;
    return { entry: (await views([doc as TimeEntryDocument]))[0]!, taskTitle: task.title, workspaceId: String(task.workspaceId) };
  });
}

/** Your own entries, or anyone's as an admin of the workspace. */
export function deleteTimeEntry(userId: string, entryId: string) {
  return withDb(async () => {
    const entry = await TimeEntry.findById(new Types.ObjectId(entryId)).lean();
    if (!entry) throw new ApiError(404, "not_found", "Time entry not found");
    await requireWorkspaceRole(userId, String(entry.workspaceId), String(entry.userId) === userId ? "viewer" : "admin");
    await TimeEntry.deleteOne({ _id: entry._id });
  });
}
