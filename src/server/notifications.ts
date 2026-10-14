import { Types } from "mongoose";
import { withDb } from "@/src/server/db/mongodb";
import { FlowUser, Notification, Project, Task, WorkspaceMembership } from "@/src/server/models";
import type { NOTIFICATION_KINDS } from "@/src/server/models/Notification";
import { resolveFlowDisplayName } from "@/src/server/users/display-name";
import type { AppNotification } from "@/src/core/sync/types";

type Kind = (typeof NOTIFICATION_KINDS)[number];

const PAGE_SIZE = 30;

/**
 * Queues in-app notifications. Never notifies the actor, skips people who are
 * no longer members, and never fails the change that caused it.
 */
export async function notify(input: {
  workspaceId: Types.ObjectId;
  taskId: Types.ObjectId;
  actorId: string;
  kind: Kind;
  recipientIds: Array<string | Types.ObjectId>;
  commentId?: Types.ObjectId | null;
}) {
  try {
    const ids = [...new Set(input.recipientIds.map(String))].filter((id) => id !== input.actorId);
    if (!ids.length) return;
    const members = await WorkspaceMembership.find({
      workspaceId: input.workspaceId,
      userId: { $in: ids.map((id) => new Types.ObjectId(id)) },
    }).select("userId").lean();
    if (!members.length) return;
    await Notification.insertMany(members.map((member) => ({
      userId: member.userId,
      workspaceId: input.workspaceId,
      taskId: input.taskId,
      commentId: input.commentId ?? null,
      actorId: new Types.ObjectId(input.actorId),
      kind: input.kind,
    })));
  } catch {
    console.error("notify failed");
  }
}

/**
 * The newest notifications, limited to workspaces the person is still in and
 * tasks that still exist.
 */
export async function listNotifications(userId: string): Promise<{ items: AppNotification[]; unread: number }> {
  return withDb(async () => {
    const user = new Types.ObjectId(userId);
    const workspaceIds = (await WorkspaceMembership.find({ userId: user }).select("workspaceId").lean())
      .map((membership) => membership.workspaceId);
    const scope = { userId: user, workspaceId: { $in: workspaceIds } };
    const [docs, unread] = await Promise.all([
      Notification.find(scope).sort({ createdAt: -1 }).limit(PAGE_SIZE).lean(),
      Notification.countDocuments({ ...scope, readAt: null }),
    ]);
    const [tasks, actors] = await Promise.all([
      Task.find({ _id: { $in: docs.map((doc) => doc.taskId) }, deletedAt: null }).select("title projectId").lean(),
      FlowUser.find({ _id: { $in: docs.map((doc) => doc.actorId) } }).select("displayName profile.displayName").lean(),
    ]);
    const liveProjects = new Set((await Project.find({
      _id: { $in: tasks.flatMap((task) => (task.projectId ? [task.projectId] : [])) },
      deletedAt: null,
    }).select("_id").lean()).map((project) => String(project._id)));
    const taskById = new Map(tasks.map((task) => [String(task._id), task]));
    const actorById = new Map(actors.map((actor) => [String(actor._id), actor]));

    const items = docs.flatMap((doc): AppNotification[] => {
      const task = taskById.get(String(doc.taskId));
      if (!task || (task.projectId && !liveProjects.has(String(task.projectId)))) return [];
      const base = task.projectId ? `/w/${doc.workspaceId}/p/${task.projectId}` : `/w/${doc.workspaceId}/inbox`;
      return [{
        id: String(doc._id),
        kind: doc.kind,
        workspaceId: String(doc.workspaceId),
        taskId: String(doc.taskId),
        taskTitle: task.title,
        actorName: resolveFlowDisplayName(actorById.get(String(doc.actorId))),
        href: `${base}?task=${doc.taskId}${doc.commentId ? `#comment-${doc.commentId}` : ""}`,
        read: Boolean(doc.readAt),
        createdAt: doc.createdAt.toISOString(),
      }];
    });
    return { items, unread };
  });
}

/** Marks the given notifications read, or all of them when `ids` is omitted. */
export async function markNotificationsRead(userId: string, ids?: string[]) {
  return withDb(async () => {
    await Notification.updateMany(
      {
        userId: new Types.ObjectId(userId),
        readAt: null,
        ...(ids ? { _id: { $in: ids.map((id) => new Types.ObjectId(id)) } } : {}),
      },
      { $set: { readAt: new Date() } },
    );
  });
}
