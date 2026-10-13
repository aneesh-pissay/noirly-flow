import { readApiJson } from "@/src/server/security/body";
import {
  ApiError,
  assertObjectId,
  getSyncProvider,
  jsonError,
  jsonOk,
} from "@/src/server/api/http";
import { createChatMessageBodySchema } from "@/src/server/api/schemas";
import { createMessage, listMessages } from "@/src/server/chat/messages";
import { publishRealtime } from "@/src/server/realtime/publish";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    await assertObjectId(projectId, "projectId");
    const before = new URL(request.url).searchParams.get("before") ?? undefined;
    if (before) await assertObjectId(before, "before");
    const { ctx } = await getSyncProvider();
    return jsonOk(await listMessages(ctx.userId, projectId, before));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    await assertObjectId(projectId, "projectId");
    const body = createChatMessageBodySchema.safeParse(await readApiJson(request));
    if (!body.success) {
      throw new ApiError(400, "invalid_request", "Messages must be 1–4000 characters");
    }
    const { ctx } = await getSyncProvider();
    const message = await createMessage(ctx.userId, projectId, body.data.body);
    void publishRealtime({
      channel: `project:${projectId}`,
      event: "chat.message",
      data: { message },
    });
    return jsonOk({ message }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
