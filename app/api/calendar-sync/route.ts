import { getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { calendarSyncStatus } from "@/src/server/calendar-sync/service";

/** Your Google and Outlook connections, and whether each can be used here. */
export async function GET() {
  try {
    const { ctx } = await getSyncProvider();
    return jsonOk({ calendars: await calendarSyncStatus(ctx.userId) });
  } catch (error) {
    return jsonError(error);
  }
}
