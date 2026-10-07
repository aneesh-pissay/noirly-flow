import { withDb } from "@/src/server/db/mongodb";
import { Task, Workspace, WorkspaceMembership } from "@/src/server/models";
import { mapTask, mapWorkspace } from "@/src/server/mappers";
import { Types } from "mongoose";

export async function searchWorkspaceContent(userId: string, rawQuery: string) {
  const q = rawQuery.trim();
  if (!q) {
    return { workspaces: [], tasks: [] };
  }

  return withDb(async () => {
    const memberships = await WorkspaceMembership.find({
      userId: new Types.ObjectId(userId),
    }).lean();
    const workspaceIds = memberships.map((m) => m.workspaceId);
    const regex = new RegExp(escapeRegex(q), "i");

    const [workspaces, tasks] = await Promise.all([
      Workspace.find({ _id: { $in: workspaceIds }, name: regex })
        .limit(8)
        .lean(),
      Task.find({
        workspaceId: { $in: workspaceIds },
        deletedAt: null,
        title: regex,
      })
        .sort({ updatedAt: -1 })
        .limit(12)
        .lean(),
    ]);

    return {
      workspaces: workspaces.map(mapWorkspace),
      tasks: tasks.map(mapTask),
    };
  });
}

export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
