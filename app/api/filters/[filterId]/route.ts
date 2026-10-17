import { readApiJson } from "@/src/server/security/body";
import { ApiError, assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { updateFilterBodySchema } from "@/src/server/api/schemas";
import { deleteFilter, updateFilter } from "@/src/server/filters";

type Params = { params: Promise<{ filterId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { filterId } = await params;
    await assertObjectId(filterId, "filterId");
    const body = updateFilterBodySchema.safeParse(await readApiJson(request));
    if (!body.success) throw new ApiError(400, "invalid_request", "Invalid filter");
    const { ctx } = await getSyncProvider();
    return jsonOk({ filter: await updateFilter(ctx.userId, filterId, body.data) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { filterId } = await params;
    await assertObjectId(filterId, "filterId");
    const { ctx } = await getSyncProvider();
    await deleteFilter(ctx.userId, filterId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
