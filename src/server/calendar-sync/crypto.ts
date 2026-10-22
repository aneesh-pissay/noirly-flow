import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Calendar OAuth tokens are encrypted at rest (AES-256-GCM) with
 * CALENDAR_TOKEN_KEY: 32 random bytes, base64. Without it, calendar sync is off.
 */
function key(): Buffer | null {
  const raw = process.env.CALENDAR_TOKEN_KEY?.trim();
  if (!raw) return null;
  const bytes = Buffer.from(raw, "base64");
  return bytes.length === 32 ? bytes : null;
}

export function canEncryptTokens() {
  return key() !== null;
}

export function sealToken(plain: string): string {
  const k = key();
  if (!k) throw new Error("CALENDAR_TOKEN_KEY is not set");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function openToken(sealed: string): string {
  const k = key();
  if (!k) throw new Error("CALENDAR_TOKEN_KEY is not set");
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("Unreadable token");
  const decipher = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}
