import { readApiJson } from "@/src/server/security/body";
import { ApiError, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { markNotificationsReadBodySchema } from "@/src/server/api/schemas";
import { markNotificationsRead } from "@/src/server/notifications";

/** `{ ids }` marks those notifications read; `{}` marks all of them. */
export async function POST(request: Request) {
  try {
    const body = markNotificationsReadBodySchema.safeParse(await readApiJson(request));
    if (!body.success) {
      throw new ApiError(400, "invalid_request", "Invalid notification ids");
    }
    const { ctx } = await getSyncProvider();
    await markNotificationsRead(ctx.userId, body.data.ids);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
