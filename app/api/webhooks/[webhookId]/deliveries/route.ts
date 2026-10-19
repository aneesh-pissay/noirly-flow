import { assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { listDeliveries } from "@/src/server/webhooks";

type Params = { params: Promise<{ webhookId: string }> };

/** The latest 25 deliveries, newest first. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { webhookId } = await params;
    await assertObjectId(webhookId, "webhookId");
    const { ctx } = await getSyncProvider();
    return jsonOk({ deliveries: await listDeliveries(ctx.userId, webhookId) });
  } catch (error) {
    return jsonError(error);
  }
}
