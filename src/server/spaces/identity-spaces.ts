import { ApiError } from "@/src/server/api/http";
import { identityIssuer } from "@/src/server/auth/identity-userinfo";

/**
 * Flow's server talking to Noirly Identity about spaces, signed in as Flow
 * itself (its OAuth client id and secret). Identity must have granted Flow's
 * client the `organizations` scope: `npm run client:grant-spaces`.
 */

export type SpaceRole = "owner" | "admin" | "member";
export type IdentitySpaceSummary = { id: string; name: string; role: SpaceRole; memberCount: number };
export type IdentitySpaceMember = { userId: string; email: string; displayName: string; role: SpaceRole };
export type IdentitySpace = { id: string; name: string; members: IdentitySpaceMember[] };

export class SpaceGoneError extends Error {}

function clientAuth() {
  const id = process.env.AUTH_NOIRLY_CLIENT_ID;
  const secret = process.env.AUTH_NOIRLY_CLIENT_SECRET;
  if (!id || !secret) throw new ApiError(503, "not_configured", "Spaces are not configured");
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

async function identity<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${identityIssuer()}${path}`, {
      method: init?.method ?? "GET",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
      headers: {
        Authorization: clientAuth(),
        Accept: "application/json",
        ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(503, "identity_unavailable", "Couldn't reach Noirly Identity. Try again shortly.");
  }
  const data = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (response.status === 404) throw new SpaceGoneError(data.message ?? "Space not found");
  if (response.status === 403) {
    throw new ApiError(503, "not_configured", "Flow isn't allowed to use spaces yet (grant it in Identity).");
  }
  if (!response.ok) throw new ApiError(502, "identity_error", data.message ?? "Noirly Identity refused the request");
  return data;
}

/** The spaces a person belongs to (by their Identity id, Flow's identitySub). */
export async function spacesForPerson(identitySub: string): Promise<IdentitySpaceSummary[]> {
  const { spaces } = await identity<{ spaces: IdentitySpaceSummary[] }>(
    `/api/integrations/users/${encodeURIComponent(identitySub)}/spaces`,
  );
  return spaces;
}

/** A space with its current members; SpaceGoneError if it no longer exists. */
export async function fetchSpace(spaceId: string): Promise<IdentitySpace> {
  const { space } = await identity<{ space: IdentitySpace }>(`/api/integrations/spaces/${encodeURIComponent(spaceId)}`);
  return space;
}

/** Creates a space owned by `ownerSub` with these members (from an existing workspace). */
export async function createSpaceFor(input: {
  name: string;
  ownerSub: string;
  members: Array<{ sub: string; role: SpaceRole }>;
}): Promise<IdentitySpace> {
  const { space } = await identity<{ space: IdentitySpace }>("/api/integrations/spaces", { method: "POST", body: input });
  return space;
}
