/** Only allow inline MIME types whose bytes match; other files remain downloadable. */
export function safeAttachmentMime(claimed: string, body: Buffer): string {
  const mime = claimed.toLowerCase().split(";")[0].trim();
  const starts = (hex: string) => body.subarray(0, hex.length / 2).equals(Buffer.from(hex, "hex"));
  if (mime === "image/png" && starts("89504e470d0a1a0a")) return mime;
  if (mime === "image/jpeg" && starts("ffd8ff")) return mime;
  if (mime === "image/gif" && /^GIF8[79]a$/.test(body.subarray(0, 6).toString("ascii"))) return mime;
  if (mime === "image/webp" && body.subarray(0, 4).toString("ascii") === "RIFF" && body.subarray(8, 12).toString("ascii") === "WEBP") return mime;
  if (mime === "application/pdf" && body.subarray(0, 5).toString("ascii") === "%PDF-") return mime;
  if (mime === "text/plain" && !body.includes(0)) {
    try { new TextDecoder("utf-8", { fatal: true }).decode(body); return mime; } catch { /* download unknown encodings */ }
  }
  return "application/octet-stream";
}
