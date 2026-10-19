import { readApiJson } from "@/src/server/security/body";
import { scheduleTaskEmails } from "@/src/server/mail/schedule-task-emails";

export const maxDuration = 60;
import {
  assertObjectId,
  getSyncProvider,
  jsonError,
  jsonOk,
  ApiError,
} from "@/src/server/api/http";
import {
  createTaskBodySchema,
  listTasksQuerySchema,
} from "@/src/server/api/schemas";
import type { TaskPriority, TaskStatus } from "@/src/core/models/enums";
import { dueRange } from "@/src/features/task/dates";
import { publishRealtime } from "@/src/server/realtime/publish";

type Params = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const url = new URL(request.url);
    const parsed = listTasksQuerySchema.safeParse({
      projectId: url.searchParams.get("projectId") ?? undefined,
      inbox: url.searchParams.get("inbox") ?? undefined,
      root: url.searchParams.get("root") ?? undefined,
      parentTaskId: url.searchParams.get("parentTaskId") ?? undefined,
      assigneeId: url.searchParams.get("assigneeId") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      priority: url.searchParams.get("priority") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      due: url.searchParams.get("due") ?? undefined,
      dueAfter: url.searchParams.get("dueAfter") ?? undefined,
      dueBefore: url.searchParams.get("dueBefore") ?? undefined,
      tag: url.searchParams.get("tag") ?? undefined,
      completedAfter: url.searchParams.get("completedAfter") ?? undefined,
    });
    if (!parsed.success) {
      throw new ApiError(400, "invalid_request", "Invalid query");
    }

    if (parsed.data.assigneeId) {
      await assertObjectId(parsed.data.assigneeId, "assigneeId");
    }
    if (parsed.data.tag) {
      await assertObjectId(parsed.data.tag, "tag");
    }

    const range = parsed.data.dueAfter || parsed.data.dueBefore
      ? { dueAfter: parsed.data.dueAfter, dueBefore: parsed.data.dueBefore }
      : dueRange(parsed.data.due);
    const { sync } = await getSyncProvider();
    const tasks = await sync.listTasks({
      workspaceId,
      projectId: parsed.data.inbox ? null : parsed.data.projectId,
      parentTaskId: parsed.data.root
        ? null
        : parsed.data.parentTaskId,
      assigneeId: parsed.data.assigneeId,
      status: parsed.data.status
        ? (parsed.data.status.split(",") as TaskStatus[])
        : undefined,
      priority: parsed.data.priority
        ? (parsed.data.priority.split(",") as TaskPriority[])
        : undefined,
      search: parsed.data.search,
      tagIds: parsed.data.tag ? [parsed.data.tag] : undefined,
      completedAfter: parsed.data.completedAfter,
      ...range,
    });
    return jsonOk({ tasks });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = createTaskBodySchema.safeParse(await readApiJson(request));
    if (!body.success) {
      throw new ApiError(400, "invalid_request", "Invalid task payload");
    }

    const { sync } = await getSyncProvider();
    const task = await sync.createTask({
      workspaceId,
      ...body.data,
    });
    scheduleTaskEmails(task.id);
    if (task.projectId) {
      void publishRealtime({
        channel: `project:${task.projectId}`,
        event: "task.upsert",
        data: { task, version: Date.parse(task.updatedAt) },
      });
    }
    return jsonOk({ task }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
