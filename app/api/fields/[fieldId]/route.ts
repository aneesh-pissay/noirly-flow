import { readApiJson } from "@/src/server/security/body";
import { ApiError, assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { updateFieldBodySchema } from "@/src/server/api/schemas";
import { deleteField, updateField } from "@/src/server/fields";

type Params = { params: Promise<{ fieldId: string }> };

/** Rename, reorder, or replace a select field's options (tasks on a dropped option are cleared). */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { fieldId } = await params;
    await assertObjectId(fieldId, "fieldId");
    const body = updateFieldBodySchema.safeParse(await readApiJson(request));
    if (!body.success) throw new ApiError(400, "invalid_request", "Invalid field");
    const { ctx } = await getSyncProvider();
    return jsonOk({ field: await updateField(ctx.userId, fieldId, body.data) });
  } catch (error) {
    return jsonError(error);
  }
}

/** Deletes the field and its values on every task. */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { fieldId } = await params;
    await assertObjectId(fieldId, "fieldId");
    const { ctx } = await getSyncProvider();
    await deleteField(ctx.userId, fieldId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
