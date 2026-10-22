import { readApiJson } from "@/src/server/security/body";
import { scheduleTaskEmails } from "@/src/server/mail/schedule-task-emails";

export const maxDuration = 60;
import {
  ApiError,
  assertObjectId,
  getSyncProvider,
  jsonError,
  jsonOk,
} from "@/src/server/api/http";
import { updateTaskBodySchema } from "@/src/server/api/schemas";
import type { Task } from "@/src/core/sync/types";
import { publishRealtime } from "@/src/server/realtime/publish";

type Params = { params: Promise<{ taskId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { taskId } = await params;
    await assertObjectId(taskId, "taskId");
    const { sync } = await getSyncProvider();
    const task = await sync.getTask(taskId);
    return jsonOk({ task });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { taskId } = await params;
    await assertObjectId(taskId, "taskId");
    const body = updateTaskBodySchema.safeParse(await readApiJson(request));
    if (!body.success) {
      throw new ApiError(400, "invalid_request", "Invalid task patch");
    }
    const { sync } = await getSyncProvider();
    const data = body.data;
    const task = await sync.updateTask(taskId, {
      ...data,
      // A patch: null clears that field value; the rest are merged in.
      fieldValues: data.fieldValues as Task["fieldValues"] | undefined,
      checklist: data.checklist?.map((item, index) => ({
        id: item.id ?? `tmp-${index}`,
        title: item.title,
        completed: item.completed ?? false,
        position: item.position ?? (index + 1) * 1000,
      })),
    });
    // Also delivers assignments created by the next recurring occurrence.
    scheduleTaskEmails();
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

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { taskId } = await params;
    await assertObjectId(taskId, "taskId");
    const { sync } = await getSyncProvider();
    const task = await sync.deleteTask(taskId);
    if (task.projectId) {
      void publishRealtime({
        channel: `project:${task.projectId}`,
        event: "task.delete",
        data: { taskId },
      });
    }
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
