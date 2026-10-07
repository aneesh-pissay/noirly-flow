import { Types } from "mongoose";
import { ApiError, assertObjectId, getSyncProvider, jsonError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { ActivityEvent, Workspace } from "@/src/server/models";
import { mapActivity } from "@/src/server/mappers";
import { listMembers, requireWorkspaceRole } from "@/src/server/workspace/members";
import { activityToCsv } from "@/src/features/activity/format";

type Params = { params: Promise<{ workspaceId: string }> };

/** Whole workspace activity log as one CSV, built in a single request. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getSyncProvider();
    const { name, csv } = await withDb(async () => {
      await requireWorkspaceRole(ctx.userId, workspaceId, "viewer");
      const workspace = await Workspace.findById(workspaceId).select("name").lean();
      if (!workspace) {
        throw new ApiError(404, "not_found", "Workspace not found");
      }
      const [members, docs] = await Promise.all([
        listMembers(workspaceId),
        ActivityEvent.find({ workspaceId: new Types.ObjectId(workspaceId) })
          .sort({ _id: -1 })
          .lean(),
      ]);
      return { name: workspace.name, csv: activityToCsv(docs.map(mapActivity), members) };
    });

    const stamp = new Date().toISOString().slice(0, 10);
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workspace";
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${slug}-activity-${stamp}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
