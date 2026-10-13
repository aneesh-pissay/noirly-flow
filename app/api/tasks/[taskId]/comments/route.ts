import { readApiJson } from "@/src/server/security/body";
import { after } from "next/server";
import { deliverCommentMentions } from "@/src/server/mail/comment-mentions";
import {
  ApiError,
  assertObjectId,
  getSyncProvider,
  jsonError,
  jsonOk,
} from "@/src/server/api/http";
import { createCommentBodySchema } from "@/src/server/api/schemas";
import { publishRealtime } from "@/src/server/realtime/publish";

type Params = { params: Promise<{ taskId: string }> };
export const maxDuration = 60;

export async function GET(_request: Request, { params }: Params) {
  try {
    const { taskId } = await params;
    await assertObjectId(taskId, "taskId");
    const { sync } = await getSyncProvider();
    const comments = await sync.listComments(taskId);
    return jsonOk({ comments });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { taskId } = await params;
    await assertObjectId(taskId, "taskId");
    const body = createCommentBodySchema.safeParse(await readApiJson(request));
    if (!body.success) {
      throw new ApiError(400, "invalid_request", "Invalid comment");
    }
    const { sync } = await getSyncProvider();
    const comment = await sync.createComment({
      taskId,
      body: body.data.body,
      mentions: body.data.mentions,
    });
    after(async () => {
      try { await deliverCommentMentions(comment.id); }
      catch { console.error("Comment mention delivery worker failed; queued mail will be retried."); }
    });
    const task = await sync.getTask(taskId);
    if (task.projectId) {
      void publishRealtime({
        channel: `project:${task.projectId}`,
        event: "comment.created",
        data: { taskId, comment },
      });
    }
    return jsonOk({ comment }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
