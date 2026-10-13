import { readApiJson } from "@/src/server/security/body";
import {
  ApiError,
  assertObjectId,
  getSyncProvider,
  jsonError,
  jsonOk,
} from "@/src/server/api/http";
import { createTagBodySchema } from "@/src/server/api/schemas";

type Params = { params: Promise<{ workspaceId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { sync } = await getSyncProvider();
    const tags = await sync.listTags(workspaceId);
    return jsonOk({ tags });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = createTagBodySchema.safeParse(await readApiJson(request));
    if (!body.success) {
      throw new ApiError(400, "invalid_request", "Invalid tag payload");
    }
    const { sync } = await getSyncProvider();
    const tag = await sync.createTag(workspaceId, body.data);
    return jsonOk({ tag }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
