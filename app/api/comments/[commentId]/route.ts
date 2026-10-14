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
import { updateCommentBodySchema } from "@/src/server/api/schemas";
import { publishRealtime } from "@/src/server/realtime/publish";

type Params = { params: Promise<{ commentId: string }> };
export const maxDuration = 60;

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { commentId } = await params;
    await assertObjectId(commentId, "commentId");
    const body = updateCommentBodySchema.safeParse(await readApiJson(request));
    if (!body.success) {
      throw new ApiError(400, "invalid_request", "Invalid comment");
    }
    const { sync } = await getSyncProvider();
    const { comment, projectId } = await sync.updateComment(commentId, {
      body: body.data.body,
      mentions: body.data.mentions,
    });
    // Members tagged for the first time by this edit.
    after(async () => {
      try { await deliverCommentMentions(comment.id); }
      catch { console.error("Comment mention delivery worker failed; queued mail will be retried."); }
    });
    if (projectId) {
      void publishRealtime({
        channel: `project:${projectId}`,
        event: "comment.updated",
        data: { taskId: comment.taskId, comment },
      });
    }
    return jsonOk({ comment });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { commentId } = await params;
    await assertObjectId(commentId, "commentId");
    const { sync } = await getSyncProvider();
    const { taskId, projectId } = await sync.deleteComment(commentId);
    if (projectId) {
      void publishRealtime({
        channel: `project:${projectId}`,
        event: "comment.deleted",
        data: { taskId, commentId },
      });
    }
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
