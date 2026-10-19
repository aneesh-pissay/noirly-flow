import { readApiJson } from "@/src/server/security/body";
import { ApiError, assertObjectId, getSyncProvider, jsonError, jsonOk, refuseAccessToken } from "@/src/server/api/http";
import { updateWebhookBodySchema } from "@/src/server/api/schemas";
import { deleteWebhook, updateWebhook } from "@/src/server/webhooks";

type Params = { params: Promise<{ webhookId: string }> };

/** Change the URL or events, or turn it on or off (on again resets its failure count). */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { webhookId } = await params;
    await assertObjectId(webhookId, "webhookId");
    const body = updateWebhookBodySchema.safeParse(await readApiJson(request));
    if (!body.success) throw new ApiError(400, "invalid_request", "Invalid webhook");
    const { ctx } = await getSyncProvider();
    refuseAccessToken(ctx, "Changing a webhook");
    return jsonOk({ webhook: await updateWebhook(ctx.userId, webhookId, body.data) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { webhookId } = await params;
    await assertObjectId(webhookId, "webhookId");
    const { ctx } = await getSyncProvider();
    refuseAccessToken(ctx, "Deleting a webhook");
    await deleteWebhook(ctx.userId, webhookId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
