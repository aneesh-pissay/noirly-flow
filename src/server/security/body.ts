import { ApiError } from "@/src/server/api/http";
/** Bounded parsing; JSON endpoints never accept multipart uploads. */
export async function readLimitedBytes(request: Request, maxBytes = 256 * 1024): Promise<Buffer> {
  const size = Number(request.headers.get("content-length"));
  if (Number.isFinite(size) && size > maxBytes) throw new ApiError(413, "payload_too_large", "Request body is too large");
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new ApiError(413, "payload_too_large", "Request body is too large");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks);
}

export async function readLimitedText(request: Request, maxBytes = 256 * 1024): Promise<string> {
  return (await readLimitedBytes(request, maxBytes)).toString("utf8");
}

export async function readApiJson(request: Request, maxBytes?: number): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") throw new ApiError(415, "unsupported_media_type", "Expected application/json");
  const text = await readLimitedText(request, maxBytes);
  try { return JSON.parse(text); } catch { throw new ApiError(400, "invalid_json", "Invalid JSON body"); }
}
