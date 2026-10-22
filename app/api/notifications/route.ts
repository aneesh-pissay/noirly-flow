import { getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { listNotifications } from "@/src/server/notifications";
import { scheduleDueReminders } from "@/src/server/reminders";
import { scheduleWebhookSweep } from "@/src/server/webhooks";
import { scheduleCalendarSync } from "@/src/server/calendar-sync/service";

export async function GET() {
  try {
    const { ctx } = await getSyncProvider();
    scheduleDueReminders();
    scheduleWebhookSweep();
    scheduleCalendarSync(ctx.userId);
    return jsonOk(await listNotifications(ctx.userId));
  } catch (error) {
    return jsonError(error);
  }
}
