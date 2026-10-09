import { createHash } from "node:crypto";

export type IdentityUserInfo = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
};

type CacheEntry = {
  userInfo: IdentityUserInfo;
  expiresAt: number;
};

const CACHE_TTL_MS = 45_000;
const cache = new Map<string, CacheEntry>();

function tokenKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function identityIssuer(): string {
  return (
    process.env.AUTH_NOIRLY_ISSUER ??
    process.env.NEXT_PUBLIC_IDENTITY_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  return match?.[1]?.trim() || null;
}

export async function fetchIdentityUserInfo(
  accessToken: string,
): Promise<IdentityUserInfo> {
  const key = tokenKey(accessToken);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.userInfo;
  }

  const response = await fetch(`${identityIssuer()}/api/oidc/userinfo`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Identity userinfo failed (${response.status})`);
  }

  const body = (await response.json()) as IdentityUserInfo;
  if (!body.sub) {
    throw new Error("Identity userinfo missing sub");
  }

  cache.set(key, {
    userInfo: body,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return body;
}

/** Test helper */
export function clearIdentityUserInfoCache() {
  cache.clear();
}
