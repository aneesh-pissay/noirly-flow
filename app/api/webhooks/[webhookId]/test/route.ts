import { assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { sendTestEvent } from "@/src/server/webhooks";

type Params = { params: Promise<{ webhookId: string }> };

export const maxDuration = 30;

/** Sends a `ping` event and waits for the receiver's answer. */
export async function POST(_request: Request, { params }: Params) {
  try {
    const { webhookId } = await params;
    await assertObjectId(webhookId, "webhookId");
    const { ctx } = await getSyncProvider();
    return jsonOk({ delivery: await sendTestEvent(ctx.userId, webhookId) });
  } catch (error) {
    return jsonError(error);
  }
}
