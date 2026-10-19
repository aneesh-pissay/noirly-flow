import { assertObjectId, getSyncProvider, jsonError, jsonOk, refuseAccessToken } from "@/src/server/api/http";
import { rotateWebhookSecret } from "@/src/server/webhooks";

type Params = { params: Promise<{ webhookId: string }> };

/** A new signing secret, shown once; the old one stops signing at once. */
export async function POST(_request: Request, { params }: Params) {
  try {
    const { webhookId } = await params;
    await assertObjectId(webhookId, "webhookId");
    const { ctx } = await getSyncProvider();
    refuseAccessToken(ctx, "Changing a webhook secret");
    return jsonOk(await rotateWebhookSecret(ctx.userId, webhookId));
  } catch (error) {
    return jsonError(error);
  }
}
