import { Types } from "mongoose";
import { withDb } from "@/src/server/db/mongodb";
import { FlowUser, Workspace, WorkspaceMembership } from "@/src/server/models";
import type { MemberRole } from "@/src/core/models/enums";
import { fetchSpace, SpaceGoneError, type IdentitySpace, type SpaceRole } from "@/src/server/spaces/identity-spaces";

/** A space's roles in Flow terms (Flow's viewer role isn't used by spaces). */
const ROLE_FROM_SPACE: Record<SpaceRole, MemberRole> = { owner: "owner", admin: "admin", member: "member" };

/** Re-sync linked workspaces when they're opened, if the last sync is older than this. */
export const SPACE_SYNC_MAX_AGE_MS = 10 * 60 * 1000;

export type SpaceSyncResult =
  | { status: "synced"; added: number; removed: number; changed: number; skipped: number }
  | { status: "unlinked" };

/**
 * Makes a linked workspace's members match its space exactly: everyone in the
 * space is a member with the space's role, and nobody else is. People who
 * haven't used Flow yet get a Flow account now (they pick up their personal
 * workspace on first sign-in). If the space is gone, the workspace is unlinked
 * and keeps its last members.
 */
export async function syncWorkspaceWithSpace(workspaceId: string): Promise<SpaceSyncResult> {
  return withDb(async () => {
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace?.spaceId) return { status: "unlinked" as const };

    let space: IdentitySpace;
    try {
      space = await fetchSpace(workspace.spaceId);
    } catch (error) {
      if (!(error instanceof SpaceGoneError)) throw error;
      workspace.spaceId = null;
      workspace.spaceName = null;
      workspace.spaceSyncedAt = null;
      await workspace.save();
      return { status: "unlinked" as const };
    }
    return applySpace(workspace._id, space);
  });
}

async function flowUserFor(member: IdentitySpace["members"][number]) {
  const existing = await FlowUser.findOne({ identitySub: member.userId }).select("_id").lean();
  if (existing) return existing._id;
  try {
    const created = await FlowUser.create({
      identitySub: member.userId,
      email: member.email.toLowerCase(),
      displayName: member.displayName || member.email.split("@")[0] || "Noirly user",
      // Identity only lists verified accounts as space members.
      emailVerified: true,
    });
    return created._id;
  } catch {
    // Raced with their own first sign-in, or an old Flow account still holds
    // that email: use whatever exists now, else skip them this round.
    return (await FlowUser.findOne({ identitySub: member.userId }).select("_id").lean())?._id ?? null;
  }
}

export async function applySpace(workspaceId: Types.ObjectId, space: IdentitySpace): Promise<SpaceSyncResult> {
  const wanted = new Map<string, MemberRole>();
  let skipped = 0;
  for (const member of space.members) {
    const userId = await flowUserFor(member);
    if (userId) wanted.set(String(userId), ROLE_FROM_SPACE[member.role]);
    else skipped += 1;
  }
  // Never empty a workspace because of a bad read: a space always has an owner.
  if (wanted.size === 0) throw new Error("Space has no members Flow can map");

  const current = await WorkspaceMembership.find({ workspaceId }).lean();
  let added = 0;
  let removed = 0;
  let changed = 0;
  for (const membership of current) {
    const role = wanted.get(String(membership.userId));
    if (!role) {
      await WorkspaceMembership.deleteOne({ _id: membership._id });
      removed += 1;
    } else if (role !== membership.role) {
      await WorkspaceMembership.updateOne({ _id: membership._id }, { $set: { role } });
      changed += 1;
    }
  }
  const have = new Set(current.map((m) => String(m.userId)));
  for (const [userId, role] of wanted) {
    if (have.has(userId)) continue;
    await WorkspaceMembership.updateOne(
      { workspaceId, userId: new Types.ObjectId(userId) },
      { $setOnInsert: { workspaceId, userId: new Types.ObjectId(userId), role } },
      { upsert: true },
    );
    added += 1;
  }

  // The recorded owner must still be an owner here; otherwise any space owner.
  const workspace = await Workspace.findById(workspaceId).select("ownerUserId").lean();
  const owners = [...wanted].filter(([, role]) => role === "owner").map(([id]) => id);
  const ownerUpdate =
    workspace && owners.length > 0 && !owners.includes(String(workspace.ownerUserId))
      ? { ownerUserId: new Types.ObjectId(owners[0]) }
      : {};
  await Workspace.updateOne(
    { _id: workspaceId },
    { $set: { spaceName: space.name, spaceSyncedAt: new Date(), ...ownerUpdate } },
  );
  return { status: "synced", added, removed, changed, skipped };
}

/** Every Flow workspace linked to a space (for Identity's change notices). */
export async function syncAllLinkedTo(spaceId: string): Promise<number> {
  const linked = await withDb(() => Workspace.find({ spaceId }).select("_id").lean());
  for (const workspace of linked) {
    await syncWorkspaceWithSpace(String(workspace._id));
  }
  return linked.length;
}
