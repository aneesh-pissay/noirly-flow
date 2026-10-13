import {
  assertObjectId,
  getSyncProvider,
  jsonError,
  jsonOk,
} from "@/src/server/api/http";
import { deleteMessage } from "@/src/server/chat/messages";
import { publishRealtime } from "@/src/server/realtime/publish";

type Params = { params: Promise<{ projectId: string; messageId: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { projectId, messageId } = await params;
    await assertObjectId(projectId, "projectId");
    await assertObjectId(messageId, "messageId");
    const { ctx } = await getSyncProvider();
    await deleteMessage(ctx.userId, projectId, messageId);
    void publishRealtime({
      channel: `project:${projectId}`,
      event: "chat.message.deleted",
      data: { messageId },
    });
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
