import { z } from "zod";
import { readApiJson } from "@/src/server/security/body";
import { ApiError, assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { addTimeEntry, listTaskTime } from "@/src/server/time";
import { MAX_ENTRY_MINUTES } from "@/src/core/time-tracking";

type Params = { params: Promise<{ taskId: string }> };

const entrySchema = z.object({
  minutes: z.number().int().min(1).max(MAX_ENTRY_MINUTES),
  note: z.string().trim().max(280).nullable().optional(),
});

/** Everyone's time on the task, newest first, with the total. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { taskId } = await params;
    await assertObjectId(taskId, "taskId");
    const { sync } = await getSyncProvider();
    const task = await sync.getTask(taskId);
    return jsonOk(await listTaskTime(task));
  } catch (error) {
    return jsonError(error);
  }
}

/** Adds time by hand: { minutes, note? }, ending now. */
export async function POST(request: Request, { params }: Params) {
  try {
    const { taskId } = await params;
    await assertObjectId(taskId, "taskId");
    const body = entrySchema.safeParse(await readApiJson(request));
    if (!body.success) throw new ApiError(400, "invalid_request", `Give a time between 1 minute and ${MAX_ENTRY_MINUTES / 60} hours`);
    const { ctx, sync } = await getSyncProvider();
    const task = await sync.getTask(taskId);
    return jsonOk({ entry: await addTimeEntry(ctx.userId, task, body.data) }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
