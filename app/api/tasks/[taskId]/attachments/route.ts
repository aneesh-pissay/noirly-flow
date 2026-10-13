import {
  ApiError,
  assertObjectId,
  getSyncProvider,
  jsonError,
  jsonOk,
} from "@/src/server/api/http";
import {
  addAttachment,
  completeAttachmentUpload,
  listAttachments,
  MAX_ATTACHMENT_BYTES,
} from "@/src/server/attachments/task-attachments";
import { completeAttachmentUploadSchema } from "@/src/server/api/schemas";
import { readApiJson, readLimitedBytes } from "@/src/server/security/body";

type Params = { params: Promise<{ taskId: string }> };

export const maxDuration = 60;

export async function GET(_request: Request, { params }: Params) {
  try {
    const { taskId } = await params;
    await assertObjectId(taskId, "taskId");
    const { ctx } = await getSyncProvider();
    return jsonOk({ attachments: await listAttachments(ctx.userId, taskId) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { taskId } = await params;
    await assertObjectId(taskId, "taskId");
    const { ctx } = await getSyncProvider();
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.toLowerCase().startsWith("application/json")) {
      const body = completeAttachmentUploadSchema.safeParse(await readApiJson(request));
      if (!body.success) throw new ApiError(400, "invalid_request", "Invalid attachment upload confirmation");
      return jsonOk({ attachment: await completeAttachmentUpload(ctx.userId, taskId, body.data) }, 201);
    }
    // Refuse oversized proxy uploads before reading them into memory.
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > MAX_ATTACHMENT_BYTES + 64 * 1024) {
      throw new ApiError(413, "too_large", "Files can be up to 25 MB");
    }
    if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
      throw new ApiError(415, "unsupported_media_type", "Expected a multipart file upload");
    }
    // Count the actual stream too: Content-Length can be absent or inaccurate.
    const bytes = await readLimitedBytes(request, MAX_ATTACHMENT_BYTES + 64 * 1024);
    const form = await new Response(Uint8Array.from(bytes), { headers: { "content-type": contentType } }).formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      throw new ApiError(400, "invalid_request", "Choose a file to attach");
    }
    if (file.size > MAX_ATTACHMENT_BYTES) throw new ApiError(413, "too_large", "Files can be up to 25 MB");
    const attachment = await addAttachment(ctx.userId, taskId, {
      name: file.name,
      type: file.type,
      size: file.size,
      body: Buffer.from(await file.arrayBuffer()),
    });
    return jsonOk({ attachment }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
