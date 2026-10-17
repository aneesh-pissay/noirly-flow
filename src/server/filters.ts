import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { SavedFilter, WorkspaceMembership, type SavedFilterDocument } from "@/src/server/models";
import type { SavedFilter as SavedFilterDto } from "@/src/core/sync/types";

/** Plenty for a sidebar; stops a script from filling the collection. */
const MAX_FILTERS = 50;

function map(doc: SavedFilterDocument): SavedFilterDto {
  return {
    id: String(doc._id),
    workspaceId: String(doc.workspaceId),
    name: doc.name,
    query: doc.query,
    position: doc.position,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

async function requireMember(userId: string, workspaceId: string) {
  if (!await WorkspaceMembership.exists({ workspaceId: new Types.ObjectId(workspaceId), userId: new Types.ObjectId(userId) })) {
    throw new ApiError(403, "forbidden", "Not a member of this workspace");
  }
}

/** A filter of the caller's own, in a workspace they're still in; anyone else's is a 404. */
async function requireOwn(userId: string, filterId: string) {
  const filter = await SavedFilter.findOne({ _id: new Types.ObjectId(filterId), userId: new Types.ObjectId(userId) });
  if (!filter) throw new ApiError(404, "not_found", "Filter not found");
  await requireMember(userId, String(filter.workspaceId));
  return filter;
}

/** Filters are personal: any member, viewers included, can keep their own. */
export function listFilters(userId: string, workspaceId: string) {
  return withDb(async () => {
    await requireMember(userId, workspaceId);
    const docs = await SavedFilter.find({ userId: new Types.ObjectId(userId), workspaceId: new Types.ObjectId(workspaceId) })
      .sort({ position: 1, createdAt: 1 }).lean();
    return docs.map(map);
  });
}

export function createFilter(userId: string, workspaceId: string, input: { name: string; query: string }) {
  return withDb(async () => {
    await requireMember(userId, workspaceId);
    const scope = { userId: new Types.ObjectId(userId), workspaceId: new Types.ObjectId(workspaceId) };
    if (await SavedFilter.countDocuments(scope) >= MAX_FILTERS) {
      throw new ApiError(400, "limit_reached", `You can keep up to ${MAX_FILTERS} filters in a workspace.`);
    }
    const last = await SavedFilter.findOne(scope).sort({ position: -1 }).select("position").lean();
    const doc = await SavedFilter.create({ ...scope, ...input, position: (last?.position ?? 0) + 1000 });
    return map(doc.toObject());
  });
}

export function updateFilter(userId: string, filterId: string, patch: { name?: string; query?: string }) {
  return withDb(async () => {
    const filter = await requireOwn(userId, filterId);
    if (patch.name !== undefined) filter.name = patch.name;
    if (patch.query !== undefined) filter.query = patch.query;
    await filter.save();
    return map(filter.toObject());
  });
}

export function deleteFilter(userId: string, filterId: string) {
  return withDb(async () => {
    const filter = await requireOwn(userId, filterId);
    await filter.deleteOne();
  });
}
