import { assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { deleteTimeEntry } from "@/src/server/time";

type Params = { params: Promise<{ entryId: string }> };

/** Deletes your own entry, or anyone's as an admin. */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { entryId } = await params;
    await assertObjectId(entryId, "entryId");
    const { ctx } = await getSyncProvider();
    await deleteTimeEntry(ctx.userId, entryId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
