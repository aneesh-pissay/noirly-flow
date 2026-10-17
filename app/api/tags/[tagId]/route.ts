import { readApiJson } from "@/src/server/security/body";
import { ApiError, assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { updateTagBodySchema } from "@/src/server/api/schemas";

type Params = { params: Promise<{ tagId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { tagId } = await params;
    await assertObjectId(tagId, "tagId");
    const body = updateTagBodySchema.safeParse(await readApiJson(request));
    if (!body.success) throw new ApiError(400, "invalid_request", "Invalid tag");
    const { sync } = await getSyncProvider();
    return jsonOk({ tag: await sync.updateTag(tagId, body.data) });
  } catch (error) {
    return jsonError(error);
  }
}

/** Deletes the tag and takes it off every task. */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { tagId } = await params;
    await assertObjectId(tagId, "tagId");
    const { sync } = await getSyncProvider();
    await sync.deleteTag(tagId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
