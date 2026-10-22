import { ApiError, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { isProvider, syncNow } from "@/src/server/calendar-sync/service";

type Params = { params: Promise<{ provider: string }> };

export const maxDuration = 120;

/** Syncs that calendar now and says how many changes went each way. */
export async function POST(_request: Request, { params }: Params) {
  try {
    const { provider } = await params;
    if (!isProvider(provider)) throw new ApiError(404, "not_found", "Unknown calendar");
    const { ctx } = await getSyncProvider();
    return jsonOk(await syncNow(ctx.userId, provider));
  } catch (error) {
    return jsonError(error);
  }
}
