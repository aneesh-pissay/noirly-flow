import type { Types } from "mongoose";
import {
  ActivityEvent,
  BoardColumn,
  Comment,
  FlowUser,
  Project,
  Report,
  Tag,
  Task,
  Workspace,
  WorkspaceInvite,
  WorkspaceMembership,
} from "@/src/server/models";
import type { MemberRole } from "@/src/core/models/enums";

/**
 * Deletes a person's Flow data when their Noirly account is deleted.
 *
 * - Their personal workspace, and team workspaces where nobody else is a
 *   member, are deleted with everything in them.
 * - In team workspaces shared with others they leave: membership, comments,
 *   activity and invites they created go; tasks they created stay with the
 *   team (no longer linked to a person) and they are removed as assignee. If
 *   they owned the workspace, the most senior remaining member becomes owner.
 * - Finally their Flow user (email, name, profile) is deleted.
 *
 * Idempotent: a second call for the same person finds nothing and returns false.
 */

const SUCCESSION: MemberRole[] = ["owner", "admin", "member", "viewer"];

async function purgeWorkspace(workspaceId: Types.ObjectId): Promise<void> {
  const projectIds = (await Project.find({ workspaceId }).select("_id").lean()).map((p) => p._id);
  await Promise.all([
    BoardColumn.deleteMany({ projectId: { $in: projectIds } }),
    Project.deleteMany({ workspaceId }),
    Task.deleteMany({ workspaceId }),
    Tag.deleteMany({ workspaceId }),
    Comment.deleteMany({ workspaceId }),
    ActivityEvent.deleteMany({ workspaceId }),
    Report.deleteMany({ workspaceId }),
    WorkspaceInvite.deleteMany({ workspaceId }),
    WorkspaceMembership.deleteMany({ workspaceId }),
  ]);
  await Workspace.deleteOne({ _id: workspaceId });
}

export type FlowDeletionSummary = {
  deleted: boolean;
  workspacesDeleted: number;
  workspacesLeft: number;
};

export async function deleteFlowAccountData(identitySub: string): Promise<FlowDeletionSummary> {
  const user = await FlowUser.findOne({ identitySub }).select("_id").lean();
  if (!user) return { deleted: false, workspacesDeleted: 0, workspacesLeft: 0 };
  const userId = user._id;

  const [memberships, owned] = await Promise.all([
    WorkspaceMembership.find({ userId }).select("workspaceId").lean(),
    Workspace.find({ ownerUserId: userId }).select("_id").lean(),
  ]);
  const workspaceIds = new Map<string, Types.ObjectId>();
  for (const id of [...memberships.map((m) => m.workspaceId), ...owned.map((w) => w._id)]) {
    workspaceIds.set(String(id), id);
  }

  let workspacesDeleted = 0;
  let workspacesLeft = 0;
  for (const workspaceId of workspaceIds.values()) {
    const workspace = await Workspace.findById(workspaceId).select("kind ownerUserId").lean();
    if (!workspace) continue;
    const others = await WorkspaceMembership.find({ workspaceId, userId: { $ne: userId } })
      .select("userId role createdAt")
      .lean();

    if (workspace.kind === "personal" || others.length === 0) {
      await purgeWorkspace(workspaceId);
      workspacesDeleted += 1;
      continue;
    }

    if (String(workspace.ownerUserId) === String(userId)) {
      const successor = [...others].sort(
        (a, b) =>
          SUCCESSION.indexOf(a.role as MemberRole) - SUCCESSION.indexOf(b.role as MemberRole) ||
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )[0]!;
      await Promise.all([
        Workspace.updateOne({ _id: workspaceId }, { $set: { ownerUserId: successor.userId } }),
        WorkspaceMembership.updateOne({ _id: successor._id }, { $set: { role: "owner" } }),
      ]);
    }
    await WorkspaceMembership.deleteMany({ workspaceId, userId });
    workspacesLeft += 1;
  }

  // What is left of them in shared workspaces.
  await Promise.all([
    Comment.deleteMany({ authorId: userId }),
    ActivityEvent.deleteMany({ actorId: userId }),
    WorkspaceInvite.deleteMany({ createdById: userId }),
    // Reports they filed, and reports about them or their content.
    Report.deleteMany({ $or: [{ reporterId: userId }, { targetUserId: userId }] }),
    Task.updateMany({ assigneeIds: userId }, { $pull: { assigneeIds: userId } }),
  ]);
  await FlowUser.deleteOne({ _id: userId });

  return { deleted: true, workspacesDeleted, workspacesLeft };
}
