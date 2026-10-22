import { ApiError, getSyncProvider, jsonError, jsonOk, refuseAccessToken } from "@/src/server/api/http";
import { disconnect, isProvider } from "@/src/server/calendar-sync/service";

type Params = { params: Promise<{ provider: string }> };

/** Disconnects that calendar and removes the Flow calendar from the account. */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { provider } = await params;
    if (!isProvider(provider)) throw new ApiError(404, "not_found", "Unknown calendar");
    const { ctx } = await getSyncProvider();
    refuseAccessToken(ctx, "Disconnecting a calendar");
    await disconnect(ctx.userId, provider);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
