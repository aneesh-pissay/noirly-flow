import { readApiJson } from "@/src/server/security/body";
import { ApiError, assertObjectId, getSyncProvider, jsonError, jsonOk, refuseAccessToken } from "@/src/server/api/http";
import { createWebhookBodySchema } from "@/src/server/api/schemas";
import { createWebhook, listWebhooks } from "@/src/server/webhooks";

type Params = { params: Promise<{ workspaceId: string }> };

/** The workspace's webhooks (admins). Secrets aren't included. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getSyncProvider();
    return jsonOk({ webhooks: await listWebhooks(ctx.userId, workspaceId) });
  } catch (error) {
    return jsonError(error);
  }
}

/** Adds a webhook; the signing secret is returned this once. */
export async function POST(request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = createWebhookBodySchema.safeParse(await readApiJson(request));
    if (!body.success) throw new ApiError(400, "invalid_request", "Give a URL and at least one event");
    const { ctx } = await getSyncProvider();
    refuseAccessToken(ctx, "Adding a webhook");
    return jsonOk(await createWebhook(ctx.userId, workspaceId, body.data), 201);
  } catch (error) {
    return jsonError(error);
  }
}
