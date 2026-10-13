import { SignJWT } from "jose";
import type { ChannelName } from "@noirly-dev/realtime-shared";

const encoder = new TextEncoder();

export function realtimeJwtSecret(): Uint8Array {
  const secret = process.env.REALTIME_JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32 || new Set(secret).size < 10) {
    throw new Error("REALTIME_JWT_SECRET must be a random secret of at least 32 bytes");
  }
  return encoder.encode(secret);
}

export async function signRealtimeJwt(opts: {
  userId: string;
  name?: string;
  caps: Record<string, Array<"subscribe" | "publish" | "presence">>;
}): Promise<{ token: string; expiresIn: number }> {
  const expiresIn = 45;
  const token = await new SignJWT({
    name: opts.name,
    caps: opts.caps as Record<ChannelName, Array<"subscribe" | "publish" | "presence">>,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(process.env.REALTIME_JWT_ISSUER ?? "noirly-flow")
    .setAudience(process.env.REALTIME_JWT_AUDIENCE ?? "noirly-realtime")
    .setSubject(opts.userId)
    .setExpirationTime(`${expiresIn}s`)
    .sign(realtimeJwtSecret());

  return { token, expiresIn };
}
