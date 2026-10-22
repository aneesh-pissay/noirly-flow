import { readLayout } from "@/src/core/layout-prefs";
import { ApiError, type FlowSessionContext } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { FlowUser } from "@/src/server/models";
import { resolveFlowDisplayName } from "@/src/server/users/display-name";
import type { FlowProfile } from "@/src/core/sync/types";

export type MePayload = {
  user: {
    id: string;
    email: string;
    displayName: string;
    identityName: string;
    profile: FlowProfile;
  };
};

export function mapProfile(user: {
  profile?: {
    displayName?: string | null;
    title?: string | null;
    timezone?: string | null;
    bio?: string | null;
    taskSaveMode?: string | null;
    density?: string | null;
    contentWidth?: string | null;
  } | null;
}): FlowProfile {
  return {
    displayName: user.profile?.displayName?.trim() || null,
    title: user.profile?.title?.trim() || null,
    timezone: user.profile?.timezone?.trim() || null,
    bio: user.profile?.bio?.trim() || null,
    taskSaveMode: user.profile?.taskSaveMode === "manual" ? "manual" : "auto",
    ...readLayout(user.profile),
  };
}

/**
 * The `GET /api/me` body. Also called while server-rendering pages that need
 * the profile, so they arrive filled in instead of fetching it after hydration.
 */
export async function loadMe(ctx: FlowSessionContext): Promise<MePayload> {
  const user = await withDb(async () =>
    FlowUser.findById(ctx.userId).select("profile").lean(),
  );
  if (!user) {
    throw new ApiError(404, "not_found", "User not found");
  }
  const profile = mapProfile(user);
  return {
    user: {
      id: ctx.userId,
      email: ctx.email,
      displayName: resolveFlowDisplayName({ displayName: ctx.displayName, profile }),
      identityName: ctx.displayName,
      profile,
    },
  };
}
