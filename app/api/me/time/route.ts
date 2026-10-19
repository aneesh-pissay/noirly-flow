import { getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { runningTimer } from "@/src/server/time";

/** Your running timer and its task, or null. */
export async function GET() {
  try {
    const { ctx } = await getSyncProvider();
    return jsonOk({ running: await runningTimer(ctx.userId) });
  } catch (error) {
    return jsonError(error);
  }
}
