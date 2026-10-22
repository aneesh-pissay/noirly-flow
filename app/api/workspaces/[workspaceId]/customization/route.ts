import { readApiJson } from "@/src/server/security/body";
import { ApiError, assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { customizeWorkspaceBodySchema } from "@/src/server/api/schemas";
import { customizeWorkspace } from "@/src/server/workspace/customize";

type Params = { params: Promise<{ workspaceId: string }> };

/** Icon, colour, default view for new projects, and status names (admins). */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = customizeWorkspaceBodySchema.safeParse(await readApiJson(request));
    if (!body.success) throw new ApiError(400, "invalid_request", "Invalid workspace settings");
    const { ctx } = await getSyncProvider();
    return jsonOk({ workspace: await customizeWorkspace(ctx.userId, workspaceId, body.data) });
  } catch (error) {
    return jsonError(error);
  }
}
