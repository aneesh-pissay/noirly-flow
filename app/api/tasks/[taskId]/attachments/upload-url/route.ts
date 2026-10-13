import { ApiError, assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { prepareAttachmentUpload } from "@/src/server/attachments/task-attachments";
import { prepareAttachmentUploadSchema } from "@/src/server/api/schemas";
import { readApiJson } from "@/src/server/security/body";

type Params = { params: Promise<{ taskId: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { taskId } = await params;
    await assertObjectId(taskId, "taskId");
    const body = prepareAttachmentUploadSchema.safeParse(await readApiJson(request));
    if (!body.success) throw new ApiError(400, "invalid_request", "Invalid attachment upload request");
    const { ctx } = await getSyncProvider();
    return jsonOk({ upload: await prepareAttachmentUpload(ctx.userId, taskId, body.data) });
  } catch (error) {
    return jsonError(error);
  }
}
