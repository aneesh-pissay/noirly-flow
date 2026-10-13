import { readApiJson } from "@/src/server/security/body";
import { getSyncProvider, jsonError, jsonOk, ApiError } from "@/src/server/api/http";
import { createWorkspaceBodySchema } from "@/src/server/api/schemas";

export async function GET() {
  try {
    const { sync } = await getSyncProvider();
    const workspaces = await sync.listWorkspaces();
    return jsonOk({ workspaces });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = createWorkspaceBodySchema.safeParse(await readApiJson(request));
    if (!body.success) {
      throw new ApiError(400, "invalid_request", "Invalid workspace payload");
    }
    const { sync } = await getSyncProvider();
    const workspace = await sync.createWorkspace({
      name: body.data.name,
      kind: "team",
    });
    return jsonOk({ workspace }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
