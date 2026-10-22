import { readApiJson } from "@/src/server/security/body";
import { getSyncProvider, jsonError, jsonOk, ApiError, refuseAccessToken } from "@/src/server/api/http";
import { updateMeBodySchema } from "@/src/server/api/schemas";
import { withDb } from "@/src/server/db/mongodb";
import { FlowUser } from "@/src/server/models";
import { deleteFlowAccountData } from "@/src/server/users/delete-account";
import { resolveFlowDisplayName } from "@/src/server/users/display-name";
import { loadMe, mapProfile } from "@/src/server/users/me";

export async function GET() {
  try {
    const { ctx } = await getSyncProvider();
    return jsonOk(await loadMe(ctx));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { ctx } = await getSyncProvider();
    const parsed = updateMeBodySchema.safeParse(await readApiJson(request));
    if (!parsed.success) {
      throw new ApiError(400, "invalid_request", "Invalid profile payload");
    }

    const $set: Record<string, string | null> = {};
    const profile = parsed.data.profile;
    if (profile.taskSaveMode !== undefined) {
      $set["profile.taskSaveMode"] = profile.taskSaveMode;
    }
    if (profile.density !== undefined) {
      $set["profile.density"] = profile.density;
    }
    if (profile.contentWidth !== undefined) {
      $set["profile.contentWidth"] = profile.contentWidth;
    }
    if (profile.displayName !== undefined) {
      $set["profile.displayName"] = profile.displayName;
    }
    if (profile.title !== undefined) {
      $set["profile.title"] = profile.title;
    }
    if (profile.timezone !== undefined) {
      $set["profile.timezone"] = profile.timezone;
    }
    if (profile.bio !== undefined) {
      $set["profile.bio"] = profile.bio;
    }

    const user = await withDb(async () =>
      FlowUser.findByIdAndUpdate(
        ctx.userId,
        Object.keys($set).length > 0 ? { $set } : {},
        { returnDocument: "after" },
      ).lean(),
    );
    if (!user) {
      throw new ApiError(404, "not_found", "User not found");
    }

    const nextProfile = mapProfile(user);
    return jsonOk({
      user: {
        id: ctx.userId,
        email: ctx.email,
        displayName: resolveFlowDisplayName({
          displayName: user.displayName,
          profile: nextProfile,
        }),
        identityName: user.displayName,
        profile: nextProfile,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * Deletes the caller's Flow data (the app's "Delete account" calls this before
 * deleting the Noirly account itself). See src/server/users/delete-account.ts
 * for what is removed and what stays with shared workspaces.
 */
export async function DELETE() {
  try {
    const { ctx } = await getSyncProvider();
    refuseAccessToken(ctx, "Deleting your account");
    const summary = await withDb(() => deleteFlowAccountData(ctx.identitySub));
    return jsonOk({ ok: true, ...summary });
  } catch (error) {
    return jsonError(error);
  }
}
