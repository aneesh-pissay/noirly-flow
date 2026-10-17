import { readApiJson } from "@/src/server/security/body";
import { scheduleTaskEmails } from "@/src/server/mail/schedule-task-emails";
import { ApiError, assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { bulkTasksBodySchema } from "@/src/server/api/schemas";
import { publishRealtime } from "@/src/server/realtime/publish";
import type { Task } from "@/src/core/sync/types";

export const maxDuration = 60;

type Params = { params: Promise<{ workspaceId: string }> };

/**
 * Changes or deletes up to 100 tasks at once: { taskIds, patch } or
 * { taskIds, delete: true }. Each task goes through the same update/delete as a
 * single edit (permissions, recurrence, emails, activity, realtime). Tasks that
 * can't be changed are reported in `failed` rather than failing the batch.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = bulkTasksBodySchema.safeParse(await readApiJson(request));
    if (!body.success) throw new ApiError(400, "invalid_request", "Invalid bulk change");
    const { sync } = await getSyncProvider();

    const tasks: Task[] = [];
    const failed: Array<{ id: string; message: string }> = [];
    for (const taskId of [...new Set(body.data.taskIds)]) {
      try {
        await assertObjectId(taskId, "taskId");
        const current = await sync.getTask(taskId);
        if (current.workspaceId !== workspaceId) throw new ApiError(404, "not_found", "Task not found");
        if (body.data.delete) {
          await sync.deleteTask(taskId);
          if (current.projectId) {
            void publishRealtime({ channel: `project:${current.projectId}`, event: "task.delete", data: { taskId } });
          }
          continue;
        }
        const task = await sync.updateTask(taskId, body.data.patch ?? {});
        tasks.push(task);
        if (task.projectId) {
          void publishRealtime({
            channel: `project:${task.projectId}`,
            event: "task.upsert",
            data: { task, version: Date.parse(task.updatedAt) },
          });
        }
      } catch (error) {
        failed.push({ id: taskId, message: error instanceof Error ? error.message : "Could not change this task" });
      }
    }
    // Assignment and completion mail, and the next copies of repeating tasks.
    scheduleTaskEmails();
    return jsonOk({ tasks, failed });
  } catch (error) {
    return jsonError(error);
  }
}
