import { getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { stopTimer } from "@/src/server/time";

/** Stops your running timer; returns the finished entry, or null if none was running. */
export async function POST() {
  try {
    const { ctx } = await getSyncProvider();
    return jsonOk({ entry: await stopTimer(ctx.userId) });
  } catch (error) {
    return jsonError(error);
  }
}
