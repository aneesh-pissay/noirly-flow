import { ApiError, assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { myStatsRows } from "@/src/server/stats";

type Params = { params: Promise<{ workspaceId: string }> };

const DAY_MS = 86_400_000;
const MAX_DAYS = 400;

/** Your own stats rows in the workspace since ?since= (ISO; default 90 days ago, at most 400). */
export async function GET(request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const raw = new URL(request.url).searchParams.get("since");
    const since = raw ? new Date(raw) : new Date(Date.now() - 90 * DAY_MS);
    if (Number.isNaN(since.getTime())) throw new ApiError(400, "invalid_request", "since must be a date");
    const earliest = new Date(Date.now() - MAX_DAYS * DAY_MS);
    const { ctx } = await getSyncProvider();
    return jsonOk(await myStatsRows(ctx.userId, workspaceId, since < earliest ? earliest : since));
  } catch (error) {
    return jsonError(error);
  }
}
