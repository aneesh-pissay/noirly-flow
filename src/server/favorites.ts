import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { FlowUser, Project, WorkspaceMembership } from "@/src/server/models";

/** The caller's favourite projects (ids), across workspaces; deleted or left ones drop out. */
export function listFavoriteProjects(userId: string) {
  return withDb(async () => {
    const user = await FlowUser.findById(new Types.ObjectId(userId)).select("favoriteProjectIds").lean();
    const ids = user?.favoriteProjectIds ?? [];
    if (!ids.length) return [];
    const memberOf = (await WorkspaceMembership.find({ userId: new Types.ObjectId(userId) }).select("workspaceId").lean())
      .map((m) => m.workspaceId);
    const live = await Project.find({ _id: { $in: ids }, deletedAt: null, workspaceId: { $in: memberOf } }).select("_id").lean();
    const liveIds = new Set(live.map((p) => String(p._id)));
    return ids.map(String).filter((id) => liveIds.has(id));
  });
}

/** Stars or unstars a project for the caller only; any member, viewers included. */
export function setFavoriteProject(userId: string, projectId: string, favorite: boolean) {
  return withDb(async () => {
    const project = await Project.findOne({ _id: new Types.ObjectId(projectId), deletedAt: null }).select("workspaceId").lean();
    if (!project) throw new ApiError(404, "not_found", "Project not found");
    if (!await WorkspaceMembership.exists({ workspaceId: project.workspaceId, userId: new Types.ObjectId(userId) })) {
      throw new ApiError(403, "forbidden", "Not a member of this workspace");
    }
    await FlowUser.updateOne(
      { _id: new Types.ObjectId(userId) },
      favorite ? { $addToSet: { favoriteProjectIds: project._id } } : { $pull: { favoriteProjectIds: project._id } },
    );
    return listFavoriteProjects(userId);
  });
}
