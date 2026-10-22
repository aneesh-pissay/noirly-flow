import { assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { startTimer } from "@/src/server/time";

type Params = { params: Promise<{ taskId: string }> };

/** Starts your timer on this task, finishing any timer you had running. */
export async function POST(_request: Request, { params }: Params) {
  try {
    const { taskId } = await params;
    await assertObjectId(taskId, "taskId");
    const { ctx, sync } = await getSyncProvider();
    const task = await sync.getTask(taskId);
    return jsonOk({ entry: await startTimer(ctx.userId, task) }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
