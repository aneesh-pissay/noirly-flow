import { apiRequestsPerMinute, consumeRateLimit } from "@/src/server/security/rate-limit";
import { cache } from "react";
import { headers } from "next/headers";
import { Types } from "mongoose";
import { auth } from "@/auth";
import { ensureFlowAccount } from "@/src/server/auth/bootstrap";
import {
  extractBearerToken,
  fetchIdentityUserInfo,
} from "@/src/server/auth/identity-userinfo";
import { withDb } from "@/src/server/db/mongodb";
import { FlowUser } from "@/src/server/models";
import { createMongoSyncProvider } from "@/src/server/providers/mongo-sync-provider";
import { withAutomations } from "@/src/server/automations";
import { resolveAccessToken } from "@/src/server/access-tokens";
import { isAccessToken } from "@/src/core/access-tokens";

export type FlowSessionContext = {
  identitySub: string;
  userId: string;
  email: string;
  displayName: string;
  /** How the request signed in: browser session, Identity bearer (mobile), or a personal access token. */
  via?: "session" | "identity" | "token";
};

export type PersonalWorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  kind: "personal";
};

async function resolveFromBearer(
  accessToken: string,
): Promise<FlowSessionContext> {
  let userInfo;
  try {
    userInfo = await fetchIdentityUserInfo(accessToken);
  } catch {
    throw new ApiError(401, "unauthorized", "Invalid or expired access token");
  }

  const identitySub = userInfo.sub;
  const existing = await withDb(async () =>
    FlowUser.findOne({ identitySub }).lean(),
  );

  if (existing) {
    return {
      identitySub: existing.identitySub,
      userId: existing._id.toString(),
      email: existing.email,
      displayName: existing.displayName,
    };
  }

  const account = await ensureFlowAccount({
    id: identitySub,
    email: userInfo.email ?? null,
    name: userInfo.name ?? null,
    image: userInfo.picture ?? null,
  });

  return {
    identitySub: account.user.identitySub,
    userId: account.user.id,
    email: account.user.email,
    displayName: account.user.displayName,
  };
}

/** Some account-level actions need a person, not a script: refuse personal access tokens. */
export function refuseAccessToken(ctx: FlowSessionContext, what: string) {
  if (ctx.via === "token") throw new ApiError(403, "forbidden", `${what} isn't available with an access token`);
}

/**
 * One bootstrap + provider per request. Cookie sessions get a personal
 * workspace; Bearer (mobile) gets ctx only. Layout, pages, and API routes
 * share this so sidebar hops do not re-upsert the user.
 */
export const getSyncProvider = cache(async () => {
  const headerStore = await headers();
  const bearer = extractBearerToken(headerStore.get("authorization"));

  if (bearer) {
    const ctx: FlowSessionContext = isAccessToken(bearer)
      ? { ...(await resolveAccessToken(bearer)).ctx, via: "token" }
      : { ...(await resolveFromBearer(bearer)), via: "identity" };
    await enforceAccountRateLimit(ctx.userId);
    return {
      ctx,
      sync: withAutomations(createMongoSyncProvider({ userId: ctx.userId }), ctx.userId),
      personal: null as PersonalWorkspaceSummary | null,
    };
  }

  const session = await auth();
  if (!session?.user?.id) {
    throw new ApiError(401, "unauthorized", "Sign in required");
  }

  await enforceAccountRateLimit(session.user.id);
  const account = await ensureFlowAccount({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image,
  });

  const ctx: FlowSessionContext = {
    identitySub: account.user.identitySub,
    userId: account.user.id,
    email: account.user.email,
    displayName: account.user.displayName,
    via: "session",
  };

  return {
    ctx,
    sync: withAutomations(createMongoSyncProvider({ userId: ctx.userId }), ctx.userId),
    personal: account.personalWorkspace as PersonalWorkspaceSummary,
  };
});

export const requireFlowSession = cache(async (): Promise<FlowSessionContext> => {
  const { ctx } = await getSyncProvider();
  return ctx;
});

/** Sidebar workspace list — request-cached so layout is the only payer. */
export const listSessionWorkspaces = cache(async () => {
  const { sync } = await getSyncProvider();
  return sync.listWorkspaces();
});

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function jsonOk<T>(data: T, status = 200) {
  return Response.json(data, { status });
}

export function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json(
      { error: error.code, message: error.message },
      { status: error.status },
    );
  }
  console.error("Request failed");
  return Response.json(
    { error: "internal_error", message: "Something went wrong" },
    { status: 500 },
  );
}

export async function assertObjectId(id: string, label = "id") {
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "invalid_request", `Invalid ${label}`);
  }
}

/** Resolve Flow user ObjectId; used by provider. */
export async function findFlowUserIdByIdentitySub(identitySub: string) {
  return withDb(async () => {
    const user = await FlowUser.findOne({ identitySub }).lean();
    return user?._id.toString() ?? null;
  });
}

async function enforceAccountRateLimit(id: string) {
  const limit = await consumeRateLimit(`flow-account:${id}`, apiRequestsPerMinute(), 60);
  if (!limit.allowed) throw new ApiError(429, "rate_limited", "Too many requests. Try again shortly.");
}
