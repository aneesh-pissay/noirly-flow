import { Types } from "mongoose";
import { assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { blockedTasksOf } from "@/src/server/dependencies";

type Params = { params: Promise<{ taskId: string }> };

/** The tasks waiting on this one (it blocks them), for the drawer. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { taskId } = await params;
    await assertObjectId(taskId, "taskId");
    const { sync } = await getSyncProvider();
    // Checks the caller can see the task.
    const task = await sync.getTask(taskId);
    const rows = await withDb(() => blockedTasksOf(new Types.ObjectId(task.id)));
    return jsonOk({
      tasks: rows.map((row) => ({ id: String(row._id), title: row.title, status: row.status })),
    });
  } catch (error) {
    return jsonError(error);
  }
}
