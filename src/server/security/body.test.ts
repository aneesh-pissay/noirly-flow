import { describe, expect, it, vi } from "vitest";
vi.mock("@/src/server/api/http", () => ({ ApiError: class extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
} }));
import { readLimitedBytes } from "./body";
import { safeAttachmentMime } from "../attachments/content-type";

describe("upload bounds and MIME validation", () => {
  it("limits streams even without Content-Length", async () => {
    const request = new Request("http://localhost/upload", { method: "POST", body: Buffer.alloc(33) });
    await expect(readLimitedBytes(request, 32)).rejects.toMatchObject({ status: 413 });
  });
  it("does not trust an understated Content-Length", async () => {
    const request = new Request("http://localhost/upload", { method: "POST", headers: { "content-length": "1" }, body: Buffer.alloc(33) });
    await expect(readLimitedBytes(request, 32)).rejects.toMatchObject({ status: 413 });
  });
  it("preserves binary multipart data", async () => {
    const body = Buffer.from([0, 255, 128, 42]);
    expect(await readLimitedBytes(new Request("http://localhost/upload", { method: "POST", body }), 32)).toEqual(body);
  });
  it("forces spoofed image and active content types to download", () => {
    const html = Buffer.from("<script>alert(1)</script>");
    expect(safeAttachmentMime("image/png", html)).toBe("application/octet-stream");
    expect(safeAttachmentMime("text/html", html)).toBe("application/octet-stream");
    expect(safeAttachmentMime("image/svg+xml", html)).toBe("application/octet-stream");
  });
  it("recognizes permitted signatures and plain UTF-8 text", () => {
    expect(safeAttachmentMime("image/png", Buffer.from("89504e470d0a1a0a", "hex"))).toBe("image/png");
    expect(safeAttachmentMime("text/plain", Buffer.from("safe text"))).toBe("text/plain");
    expect(safeAttachmentMime("text/plain", Buffer.from([255, 0]))).toBe("application/octet-stream");
  });
});
