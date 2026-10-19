import { assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { redeliver } from "@/src/server/webhooks";

type Params = { params: Promise<{ webhookId: string; deliveryId: string }> };

export const maxDuration = 30;

/** Sends a delivery again now, with the same event id and body. */
export async function POST(_request: Request, { params }: Params) {
  try {
    const { webhookId, deliveryId } = await params;
    await assertObjectId(webhookId, "webhookId");
    await assertObjectId(deliveryId, "deliveryId");
    const { ctx } = await getSyncProvider();
    return jsonOk({ delivery: await redeliver(ctx.userId, webhookId, deliveryId) });
  } catch (error) {
    return jsonError(error);
  }
}
