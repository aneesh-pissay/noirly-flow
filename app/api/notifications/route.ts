import { getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { listNotifications } from "@/src/server/notifications";
import { scheduleDueReminders } from "@/src/server/reminders";

export async function GET() {
  try {
    const { ctx } = await getSyncProvider();
    scheduleDueReminders();
    return jsonOk(await listNotifications(ctx.userId));
  } catch (error) {
    return jsonError(error);
  }
}
