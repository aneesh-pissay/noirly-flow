import {
  assertObjectId,
  getSyncProvider,
  jsonError,
  jsonOk,
} from "@/src/server/api/http";
import { deleteAttachment, openAttachment } from "@/src/server/attachments/task-attachments";

type Params = { params: Promise<{ attachmentId: string }> };

/** Downloads an attachment, for members of its workspace only. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { attachmentId } = await params;
    await assertObjectId(attachmentId, "attachmentId");
    const { ctx } = await getSyncProvider();
    const file = await openAttachment(ctx.userId, attachmentId);
    const disposition = file.inline ? "inline" : "attachment";
    return new Response(Buffer.from(file.bytes), {
      headers: {
        "Content-Type": file.mime,
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        "Content-Length": String(file.bytes.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        // Even an allowed inline type gets no scripts or framing. (Not `sandbox`:
        // it stops Chrome's built-in viewer from opening PDFs.)
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { attachmentId } = await params;
    await assertObjectId(attachmentId, "attachmentId");
    const { ctx } = await getSyncProvider();
    await deleteAttachment(ctx.userId, attachmentId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
