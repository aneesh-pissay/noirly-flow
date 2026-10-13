import {
  assertObjectId,
  getSyncProvider,
  jsonError,
  jsonOk,
} from "@/src/server/api/http";
import { listMembers, requireWorkspaceRole } from "@/src/server/workspace/members";
import { withDb } from "@/src/server/db/mongodb";

type Params = { params: Promise<{ workspaceId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getSyncProvider();
    const members = await withDb(async () => {
      await requireWorkspaceRole(ctx.userId, workspaceId, "viewer");
      return listMembers(workspaceId);
    });
    return jsonOk({ members });
  } catch (error) {
    return jsonError(error);
  }
}
