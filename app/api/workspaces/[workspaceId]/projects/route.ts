import { readApiJson } from "@/src/server/security/body";
import {
  ApiError,
  assertObjectId,
  getSyncProvider,
  jsonError,
  jsonOk,
} from "@/src/server/api/http";
import { createProjectBodySchema } from "@/src/server/api/schemas";

type Params = { params: Promise<{ workspaceId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { sync } = await getSyncProvider();
    const projects = await sync.listProjects(workspaceId);
    return jsonOk({ projects });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = createProjectBodySchema.safeParse(await readApiJson(request));
    if (!body.success) {
      throw new ApiError(400, "invalid_request", "Invalid project payload");
    }
    const { sync } = await getSyncProvider();
    const project = await sync.createProject({
      workspaceId,
      name: body.data.name,
      description: body.data.description ?? null,
    });
    return jsonOk({ project }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
