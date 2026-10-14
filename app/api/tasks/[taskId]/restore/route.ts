import {
  assertObjectId,
  getSyncProvider,
  jsonError,
  jsonOk,
} from "@/src/server/api/http";
import { publishRealtime } from "@/src/server/realtime/publish";

type Params = { params: Promise<{ taskId: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const { taskId } = await params;
    await assertObjectId(taskId, "taskId");
    const { sync } = await getSyncProvider();
    const task = await sync.restoreTask(taskId);
    if (task.projectId) {
      void publishRealtime({
        channel: `project:${task.projectId}`,
        event: "task.upsert",
        data: { task, version: Date.parse(task.updatedAt) },
      });
    }
    return jsonOk({ task });
  } catch (error) {
    return jsonError(error);
  }
}
