import { Types } from "mongoose";
import { withDb } from "@/src/server/db/mongodb";
import { Task, TimeEntry } from "@/src/server/models";
import { requireWorkspaceRole } from "@/src/server/workspace/members";
import type { CompletedRow, OpenRow, TimeRow } from "@/src/core/stats";

/**
 * The raw rows behind someone's stats in a workspace, since `since`: tasks
 * they finished, their open dated tasks, and time they tracked. "Theirs" is
 * assigned to them, or unassigned and created by them. Days are counted in
 * the browser, so the totals follow the viewer's time zone.
 */
export function myStatsRows(userId: string, workspaceId: string, since: Date) {
  return withDb(async (): Promise<{ completed: CompletedRow[]; open: OpenRow[]; time: TimeRow[] }> => {
    await requireWorkspaceRole(userId, workspaceId, "viewer");
    const me = new Types.ObjectId(userId);
    const ws = new Types.ObjectId(workspaceId);
    const mine = { workspaceId: ws, deletedAt: null, $or: [{ assigneeIds: me }, { createdById: me, "assigneeIds.0": { $exists: false } }] };
    const [completed, open, time] = await Promise.all([
      Task.find({ ...mine, status: "done", completedAt: { $gte: since } }).select("completedAt dueAt dueHasTime").limit(5000).lean(),
      Task.find({ ...mine, status: { $in: ["todo", "in_progress"] }, dueAt: { $ne: null } }).select("dueAt dueHasTime").limit(5000).lean(),
      TimeEntry.find({ userId: me, workspaceId: ws, endedAt: { $ne: null }, startedAt: { $gte: since } }).select("startedAt minutes").limit(10000).lean(),
    ]);
    return {
      completed: completed.map((t) => ({ completedAt: t.completedAt!.toISOString(), dueAt: t.dueAt ? t.dueAt.toISOString() : null, dueHasTime: Boolean(t.dueHasTime) })),
      open: open.map((t) => ({ dueAt: t.dueAt!.toISOString(), dueHasTime: Boolean(t.dueHasTime) })),
      time: time.map((e) => ({ startedAt: e.startedAt.toISOString(), minutes: e.minutes ?? 0 })),
    };
  });
}
