import { readApiJson } from "@/src/server/security/body";
import {
  ApiError,
  assertObjectId,
  getSyncProvider,
  jsonError,
  jsonOk,
} from "@/src/server/api/http";
import { updateProjectBodySchema } from "@/src/server/api/schemas";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    await assertObjectId(projectId, "projectId");
    const { sync } = await getSyncProvider();
    const project = await sync.getProject(projectId);
    return jsonOk({ project });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    await assertObjectId(projectId, "projectId");
    const body = updateProjectBodySchema.safeParse(await readApiJson(request));
    if (!body.success) {
      throw new ApiError(400, "invalid_request", "Invalid project payload");
    }
    const { sync } = await getSyncProvider();
    const project = await sync.updateProject(projectId, body.data);
    return jsonOk({ project });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    await assertObjectId(projectId, "projectId");
    const { sync } = await getSyncProvider();
    await sync.deleteProject(projectId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
