import { readApiJson } from "@/src/server/security/body";
import { ApiError, assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { updateFormBodySchema } from "@/src/server/api/schemas";
import { deleteForm, updateForm } from "@/src/server/forms";

type Params = { params: Promise<{ formId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { formId } = await params;
    await assertObjectId(formId, "formId");
    const body = updateFormBodySchema.safeParse(await readApiJson(request));
    if (!body.success) throw new ApiError(400, "invalid_request", "Invalid form");
    const { ctx } = await getSyncProvider();
    return jsonOk({ form: await updateForm(ctx.userId, formId, body.data) });
  } catch (error) {
    return jsonError(error);
  }
}

/** Deletes the form; its link stops working. Tasks it made stay. */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { formId } = await params;
    await assertObjectId(formId, "formId");
    const { ctx } = await getSyncProvider();
    await deleteForm(ctx.userId, formId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
