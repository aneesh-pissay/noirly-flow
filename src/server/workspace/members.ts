import { createHash, randomBytes } from "node:crypto";
import { Types } from "mongoose";
import { withDb } from "@/src/server/db/mongodb";
import {
  BoardColumn,
  FlowUser,
  Project,
  Workspace,
  WorkspaceInvite,
  WorkspaceMembership,
} from "@/src/server/models";
import { ApiError } from "@/src/server/api/http";
import type { MemberRole } from "@/src/core/models/enums";
import { resolveFlowDisplayName } from "@/src/server/users/display-name";

function oid(id: string) {
  if (typeof id !== "string" || !/^[a-f0-9]{24}$/i.test(id)) throw new ApiError(400, "invalid_request", "Invalid object ID");
  return new Types.ObjectId(id);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export type MemberView = {
  userId: string;
  email: string;
  displayName: string;
  role: MemberRole;
  /** Created the workspace. Nobody else can change their role or remove them. */
  isCreator: boolean;
};

/**
 * The person who created a team workspace keeps it: other owners can manage
 * everyone else, but not demote or remove them. (Ownership only moves when the
 * creator deletes their account — see users/delete-account.ts.)
 */
async function assertNotCreator(workspaceId: string, targetUserId: string, action: string) {
  const workspace = await Workspace.findById(workspaceId).select("ownerUserId").lean();
  if (workspace && workspace.ownerUserId.toString() === targetUserId) {
    throw new ApiError(403, "forbidden", `The workspace creator can't be ${action}`);
  }
}

export async function requireWorkspaceRole(
  userId: string,
  workspaceId: string,
  min: MemberRole,
): Promise<MemberRole> {
  const membership = await WorkspaceMembership.findOne({
    workspaceId: oid(workspaceId),
    userId: oid(userId),
  }).lean();
  if (!membership) {
    throw new ApiError(403, "forbidden", "Not a member of this workspace");
  }
  const role = membership.role as MemberRole;
  const rank = { viewer: 1, member: 2, admin: 3, owner: 4 };
  if (rank[role] < rank[min]) {
    throw new ApiError(403, "forbidden", "Insufficient permissions");
  }
  return role;
}

export async function listMembers(workspaceId: string): Promise<MemberView[]> {
  const [memberships, workspace] = await Promise.all([
    WorkspaceMembership.find({ workspaceId: oid(workspaceId) }).lean(),
    Workspace.findById(workspaceId).select("ownerUserId").lean(),
  ]);
  const creatorId = workspace?.ownerUserId.toString();
  const users = await FlowUser.find({
    _id: { $in: memberships.map((m) => m.userId) },
  }).lean();
  const byId = new Map(users.map((user) => [user._id.toString(), user]));
  return memberships.map((membership) => {
    const user = byId.get(membership.userId.toString());
    return {
      userId: membership.userId.toString(),
      email: user?.email ?? "",
      displayName: resolveFlowDisplayName(user),
      role: membership.role as MemberRole,
      isCreator: membership.userId.toString() === creatorId,
    };
  });
}

export async function createInvite(input: {
  workspaceId: string;
  userId: string;
  role: Exclude<MemberRole, "owner">;
  /** Locks the invite to this address (emailed invites). */
  email?: string | null;
  days?: number;
}) {
  return withDb(async () => {
    await requireWorkspaceRole(input.userId, input.workspaceId, "admin");
    const email = input.email?.trim().toLowerCase() || null;
    if (email) {
      const user = await FlowUser.findOne({ email }).select("_id").lean();
      if (
        user &&
        (await WorkspaceMembership.exists({ workspaceId: oid(input.workspaceId), userId: user._id }))
      ) {
        throw new ApiError(409, "conflict", `${email} is already a member`);
      }
    }
    const token = randomBytes(24).toString("base64url");
    const days = input.days ?? 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    await WorkspaceInvite.create({
      workspaceId: oid(input.workspaceId),
      role: input.role,
      tokenHash: hashToken(token),
      email,
      createdById: oid(input.userId),
      expiresAt,
    });

    return { token, expiresAt: expiresAt.toISOString(), role: input.role, email };
  });
}

export async function acceptInvite(userId: string, token: string, userEmail: string) {
  return withDb(async () => {
    const live = { tokenHash: hashToken(token), revokedAt: null, usedAt: null, expiresAt: { $gt: new Date() } };
    // An emailed invite belongs to that address. Checked before claiming it, so
    // opening a forwarded link with the wrong account doesn't burn the invite.
    const pending = await WorkspaceInvite.findOne(live).select("email").lean();
    if (pending?.email && pending.email !== userEmail.trim().toLowerCase()) {
      throw new ApiError(
        403,
        "forbidden",
        `This invite was sent to ${pending.email}. Sign in with that email to accept it.`,
      );
    }
    const invite = await WorkspaceInvite.findOneAndUpdate(
      pending?.email ? { ...live, email: pending.email } : live,
      { $set: { usedAt: new Date() } },
      { returnDocument: "after" },
    );
    if (!invite) throw new ApiError(400, "invalid_request", "Invite is invalid, expired, or already used");

    const existing = await WorkspaceMembership.findOne({
      workspaceId: invite.workspaceId,
      userId: oid(userId),
    });
    if (!existing) {
      await WorkspaceMembership.create({
        workspaceId: invite.workspaceId,
        userId: oid(userId),
        role: invite.role,
      });
    }


    const workspace = await Workspace.findById(invite.workspaceId).lean();
    if (!workspace) {
      throw new ApiError(404, "not_found", "Workspace not found");
    }
    return {
      workspaceId: workspace._id.toString(),
      name: workspace.name,
      alreadyMember: Boolean(existing),
    };
  });
}

/** Withdraws an invite that failed to send, so its link can't be used. */
export async function revokeInvite(token: string) {
  await withDb(() =>
    WorkspaceInvite.updateOne({ tokenHash: hashToken(token) }, { $set: { revokedAt: new Date() } }),
  );
}

export async function updateMemberRole(input: {
  actorId: string;
  workspaceId: string;
  targetUserId: string;
  role: MemberRole;
}) {
  return withDb(async () => {
    const actorRole = await requireWorkspaceRole(
      input.actorId,
      input.workspaceId,
      "admin",
    );
    if (input.role === "owner" && actorRole !== "owner") {
      throw new ApiError(403, "forbidden", "Only the owner can assign owner");
    }
    if (input.targetUserId === input.actorId && input.role !== actorRole) {
      throw new ApiError(400, "invalid_request", "You cannot change your own role");
    }
    if (input.targetUserId !== input.actorId) {
      await assertNotCreator(input.workspaceId, input.targetUserId, "changed to another role");
    }

    const membership = await WorkspaceMembership.findOne({
      workspaceId: oid(input.workspaceId),
      userId: oid(input.targetUserId),
    });
    if (!membership) {
      throw new ApiError(404, "not_found", "Member not found");
    }
    if (membership.role === "owner" && actorRole !== "owner") {
      throw new ApiError(403, "forbidden", "Only an owner can modify another owner");
    }
    if (membership.role === "owner" && input.role !== "owner") {
      const owners = await WorkspaceMembership.countDocuments({
        workspaceId: oid(input.workspaceId),
        role: "owner",
      });
      if (owners <= 1) {
        throw new ApiError(400, "invalid_request", "Keep at least one owner");
      }
    }
    membership.role = input.role;
    await membership.save();
    return { userId: input.targetUserId, role: input.role };
  });
}

export async function removeMember(input: {
  actorId: string;
  workspaceId: string;
  targetUserId: string;
}) {
  return withDb(async () => {
    const actorRole = await requireWorkspaceRole(input.actorId, input.workspaceId, "admin");
    await assertNotCreator(input.workspaceId, input.targetUserId, "removed");
    const membership = await WorkspaceMembership.findOne({
      workspaceId: oid(input.workspaceId),
      userId: oid(input.targetUserId),
    });
    if (!membership) {
      throw new ApiError(404, "not_found", "Member not found");
    }
    if (membership.role === "owner" && actorRole !== "owner") {
      throw new ApiError(403, "forbidden", "Only an owner can modify another owner");
    }
    if (membership.role === "owner") {
      const owners = await WorkspaceMembership.countDocuments({
        workspaceId: oid(input.workspaceId),
        role: "owner",
      });
      if (owners <= 1) {
        throw new ApiError(400, "invalid_request", "Keep at least one owner");
      }
    }
    await membership.deleteOne();
  });
}

export async function ensureDefaultProject(workspaceId: Types.ObjectId) {
  const existing = await Project.findOne({ workspaceId, deletedAt: null });
  if (existing) return existing;
  const project = await Project.create({
    workspaceId,
    name: "General",
    defaultView: "board",
  });
  await BoardColumn.insertMany([
    { projectId: project._id, name: "Todo", statusMapped: "todo", position: 1000 },
    {
      projectId: project._id,
      name: "In progress",
      statusMapped: "in_progress",
      position: 2000,
    },
    { projectId: project._id, name: "Done", statusMapped: "done", position: 3000 },
  ]);
  return project;
}
