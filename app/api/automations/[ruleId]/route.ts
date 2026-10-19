import { readApiJson } from "@/src/server/security/body";
import { ApiError, assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { updateAutomationBodySchema } from "@/src/server/api/schemas";
import { deleteRule, updateRule } from "@/src/server/automations";

type Params = { params: Promise<{ ruleId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { ruleId } = await params;
    await assertObjectId(ruleId, "ruleId");
    const body = updateAutomationBodySchema.safeParse(await readApiJson(request));
    if (!body.success) throw new ApiError(400, "invalid_request", "Invalid automation");
    const { ctx } = await getSyncProvider();
    return jsonOk({ rule: await updateRule(ctx.userId, ruleId, body.data) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { ruleId } = await params;
    await assertObjectId(ruleId, "ruleId");
    const { ctx } = await getSyncProvider();
    await deleteRule(ctx.userId, ruleId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
