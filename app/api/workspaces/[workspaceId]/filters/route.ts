import { readApiJson } from "@/src/server/security/body";
import { ApiError, assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { createFilterBodySchema } from "@/src/server/api/schemas";
import { createFilter, listFilters } from "@/src/server/filters";

type Params = { params: Promise<{ workspaceId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getSyncProvider();
    return jsonOk({ filters: await listFilters(ctx.userId, workspaceId) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = createFilterBodySchema.safeParse(await readApiJson(request));
    if (!body.success) throw new ApiError(400, "invalid_request", "Invalid filter");
    const { ctx } = await getSyncProvider();
    return jsonOk({ filter: await createFilter(ctx.userId, workspaceId, body.data) }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
