import { after } from "next/server";
import { Types } from "mongoose";
import { withDb } from "@/src/server/db/mongodb";
import { ApiError, type FlowSessionContext } from "@/src/server/api/http";
import { FlowUser, Workspace, WorkspaceMembership } from "@/src/server/models";
import { requireWorkspaceRole } from "@/src/server/workspace/members";
import type { MemberRole } from "@/src/core/models/enums";
import {
  createSpaceFor,
  fetchSpace,
  SpaceGoneError,
  spacesForPerson,
  type IdentitySpaceSummary,
  type SpaceRole,
} from "@/src/server/spaces/identity-spaces";
import { identityIssuer } from "@/src/server/auth/identity-userinfo";
import { applySpace, SPACE_SYNC_MAX_AGE_MS, syncWorkspaceWithSpace, type SpaceSyncResult } from "@/src/server/spaces/sync";

export type SpaceLinkStatus = {
  link: { spaceId: string; spaceName: string | null; syncedAt: string | null } | null;
  /** Spaces this person runs (owner/admin) and could link to; only for Flow admins of an unlinked team. */
  linkable: IdentitySpaceSummary[];
  /** Where people manage spaces (Noirly Identity). */
  manageUrl: string;
};

/** Flow has a viewer role; spaces don't, so viewers come across as members. */
const ROLE_TO_SPACE: Record<MemberRole, SpaceRole> = { owner: "owner", admin: "admin", member: "member", viewer: "member" };

function oid(id: string) {
  if (!/^[a-f0-9]{24}$/i.test(id)) throw new ApiError(400, "invalid_request", "Invalid workspace id");
  return new Types.ObjectId(id);
}

async function teamWorkspace(workspaceId: string) {
  const workspace = await Workspace.findById(oid(workspaceId)).lean();
  if (!workspace) throw new ApiError(404, "not_found", "Workspace not found");
  if (workspace.kind === "personal") {
    throw new ApiError(400, "invalid_request", "Your personal workspace can't be linked to a space");
  }
  return workspace;
}

export async function getSpaceLinkStatus(ctx: FlowSessionContext, workspaceId: string): Promise<SpaceLinkStatus> {
  const { workspace, role } = await withDb(async () => ({
    role: await requireWorkspaceRole(ctx.userId, workspaceId, "viewer"),
    workspace: await Workspace.findById(oid(workspaceId)).select("kind spaceId spaceName spaceSyncedAt").lean(),
  }));
  if (!workspace) throw new ApiError(404, "not_found", "Workspace not found");
  const manageUrl = `${identityIssuer()}/spaces`;
  if (workspace.spaceId) {
    return {
      link: {
        spaceId: workspace.spaceId,
        spaceName: workspace.spaceName ?? null,
        syncedAt: workspace.spaceSyncedAt?.toISOString() ?? null,
      },
      linkable: [],
      manageUrl,
    };
  }
  if (workspace.kind === "personal" || (role !== "owner" && role !== "admin")) {
    return { link: null, linkable: [], manageUrl };
  }
  const spaces = await spacesForPerson(ctx.identitySub);
  return { link: null, linkable: spaces.filter((space) => space.role !== "member"), manageUrl };
}

/**
 * Links a team to a space the person runs. From then on the space decides
 * who's in the team: anyone in the team but not in the space loses access now.
 */
export async function linkWorkspaceToSpace(ctx: FlowSessionContext, workspaceId: string, spaceId: string) {
  await withDb(async () => {
    await requireWorkspaceRole(ctx.userId, workspaceId, "admin");
    const workspace = await teamWorkspace(workspaceId);
    if (workspace.spaceId) throw new ApiError(409, "space_linked", "This team is already linked to a space");
  });
  const mine = (await spacesForPerson(ctx.identitySub)).find((space) => space.id === spaceId);
  if (!mine || mine.role === "member") {
    throw new ApiError(403, "forbidden", "You can only link a space you own or administer");
  }
  let space;
  try {
    space = await fetchSpace(spaceId);
  } catch (error) {
    if (error instanceof SpaceGoneError) throw new ApiError(404, "not_found", "Space not found");
    throw error;
  }
  return withDb(async () => {
    const claimed = await Workspace.updateOne(
      { _id: oid(workspaceId), spaceId: null },
      { $set: { spaceId: space.id, spaceName: space.name } },
    );
    if (claimed.modifiedCount === 0) throw new ApiError(409, "space_linked", "This team is already linked to a space");
    return applySpace(oid(workspaceId), space);
  });
}

/**
 * Turns a team into a new space with the same people (owned by whoever does
 * it), then links them. People without a verified Noirly account can't join
 * a space, so they drop out of the team; `skipped` counts them.
 */
export async function createSpaceFromWorkspace(ctx: FlowSessionContext, workspaceId: string, name?: string) {
  const { workspace, members } = await withDb(async () => {
    await requireWorkspaceRole(ctx.userId, workspaceId, "admin");
    const workspace = await teamWorkspace(workspaceId);
    if (workspace.spaceId) throw new ApiError(409, "space_linked", "This team is already linked to a space");
    const memberships = await WorkspaceMembership.find({ workspaceId: workspace._id }).lean();
    const users = await FlowUser.find({ _id: { $in: memberships.map((m) => m.userId) } })
      .select("identitySub")
      .lean();
    const subById = new Map(users.map((user) => [String(user._id), user.identitySub]));
    const members = memberships
      .map((m) => ({ sub: subById.get(String(m.userId)), role: ROLE_TO_SPACE[m.role as MemberRole] }))
      .filter((m): m is { sub: string; role: SpaceRole } => Boolean(m.sub) && m.sub !== ctx.identitySub);
    return { workspace, members };
  });

  const space = await createSpaceFor({
    name: (name?.trim() || workspace.name).slice(0, 80),
    ownerSub: ctx.identitySub,
    members,
  });
  const result = await withDb(async () => {
    const claimed = await Workspace.updateOne(
      { _id: workspace._id, spaceId: null },
      { $set: { spaceId: space.id, spaceName: space.name } },
    );
    if (claimed.modifiedCount === 0) throw new ApiError(409, "space_linked", "This team is already linked to a space");
    return applySpace(workspace._id, space);
  });
  const dropped = members.length + 1 - space.members.length;
  return { result, spaceId: space.id, dropped: Math.max(0, dropped) };
}

/** Stops following the space. The team keeps its current members and manages them in Flow again. */
export async function unlinkWorkspaceFromSpace(ctx: FlowSessionContext, workspaceId: string) {
  await withDb(async () => {
    await requireWorkspaceRole(ctx.userId, workspaceId, "admin");
    await Workspace.updateOne(
      { _id: oid(workspaceId) },
      { $set: { spaceId: null, spaceName: null, spaceSyncedAt: null } },
    );
  });
}

export async function syncWorkspaceNow(ctx: FlowSessionContext, workspaceId: string): Promise<SpaceSyncResult> {
  await withDb(() => requireWorkspaceRole(ctx.userId, workspaceId, "member"));
  return syncWorkspaceWithSpace(workspaceId);
}

/**
 * Backstop for missed Identity notices: when a linked team is opened and its
 * last sync is old, re-sync after the response is sent.
 */
export function resyncLaterIfStale(workspace: { id: string; spaceId?: string | null }) {
  if (!workspace.spaceId) return;
  after(async () => {
    try {
      const fresh = await withDb(() =>
        Workspace.findById(workspace.id).select("spaceId spaceSyncedAt").lean(),
      );
      if (!fresh?.spaceId) return;
      const age = fresh.spaceSyncedAt ? Date.now() - fresh.spaceSyncedAt.getTime() : Infinity;
      if (age < SPACE_SYNC_MAX_AGE_MS) return;
      await syncWorkspaceWithSpace(workspace.id);
    } catch {
      console.error("Background space sync failed");
    }
  });
}
