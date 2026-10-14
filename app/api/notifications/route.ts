import { getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { listNotifications } from "@/src/server/notifications";

export async function GET() {
  try {
    const { ctx } = await getSyncProvider();
    return jsonOk(await listNotifications(ctx.userId));
  } catch (error) {
    return jsonError(error);
  }
}
