import { getSyncProvider, jsonError, jsonOk, refuseAccessToken } from "@/src/server/api/http";
import { disableFeed, getFeedStatus, rotateFeed } from "@/src/server/calendar/feed";

export async function GET() {
  try {
    const { ctx } = await getSyncProvider();
    return jsonOk(await getFeedStatus(ctx.userId));
  } catch (error) {
    return jsonError(error);
  }
}

/** Creates or replaces the link. Its URL is only ever returned here. */
export async function POST() {
  try {
    const { ctx } = await getSyncProvider();
    refuseAccessToken(ctx, "Changing the calendar link");
    const { url, createdAt } = await rotateFeed(ctx.userId);
    return jsonOk({ enabled: true, createdAt, url }, 201);
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE() {
  try {
    const { ctx } = await getSyncProvider();
    refuseAccessToken(ctx, "Changing the calendar link");
    await disableFeed(ctx.userId);
    return jsonOk({ enabled: false, createdAt: null });
  } catch (error) {
    return jsonError(error);
  }
}
