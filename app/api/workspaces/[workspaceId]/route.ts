import { readApiJson } from "@/src/server/security/body";
import {
  ApiError,
  assertObjectId,
  getSyncProvider,
  jsonError,
  jsonOk,
} from "@/src/server/api/http";
import { updateWorkspaceBodySchema } from "@/src/server/api/schemas";
import { resyncLaterIfStale } from "@/src/server/spaces/link";

type Params = { params: Promise<{ workspaceId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { sync } = await getSyncProvider();
    const [workspace, projects] = await Promise.all([
      sync.getWorkspace(workspaceId),
      sync.listProjects(workspaceId),
    ]);
    resyncLaterIfStale(workspace);
    return jsonOk({ workspace, projects });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = updateWorkspaceBodySchema.safeParse(await readApiJson(request));
    if (!body.success) {
      throw new ApiError(400, "invalid_request", "Invalid workspace payload");
    }
    const { sync } = await getSyncProvider();
    const workspace = await sync.updateWorkspace(workspaceId, body.data);
    return jsonOk({ workspace });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { sync } = await getSyncProvider();
    await sync.deleteWorkspace(workspaceId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
