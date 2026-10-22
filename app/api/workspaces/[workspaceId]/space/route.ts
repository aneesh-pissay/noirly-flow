import { z } from "zod";
import { readApiJson } from "@/src/server/security/body";
import { ApiError, assertObjectId, getSyncProvider, jsonError, jsonOk, refuseAccessToken } from "@/src/server/api/http";
import {
  createSpaceFromWorkspace,
  getSpaceLinkStatus,
  linkWorkspaceToSpace,
  syncWorkspaceNow,
  unlinkWorkspaceFromSpace,
} from "@/src/server/spaces/link";

type Params = { params: Promise<{ workspaceId: string }> };

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("link"), spaceId: z.string().regex(/^[a-f0-9]{24}$/i) }),
  z.object({ action: z.literal("create"), name: z.string().trim().max(80).optional() }),
  z.object({ action: z.literal("sync") }),
]);

/** Whether this team follows a Noirly space, and which spaces it could follow. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getSyncProvider();
    return jsonOk(await getSpaceLinkStatus(ctx, workspaceId));
  } catch (error) {
    return jsonError(error);
  }
}

/** Link to a space, turn the team into a new space, or re-sync now. */
export async function POST(request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = actionSchema.safeParse(await readApiJson(request));
    if (!body.success) throw new ApiError(400, "invalid_request", "Invalid space action");
    const { ctx } = await getSyncProvider();
    refuseAccessToken(ctx, "Linking a Space");
    if (body.data.action === "link") {
      return jsonOk({ result: await linkWorkspaceToSpace(ctx, workspaceId, body.data.spaceId) });
    }
    if (body.data.action === "create") {
      return jsonOk(await createSpaceFromWorkspace(ctx, workspaceId, body.data.name), 201);
    }
    return jsonOk({ result: await syncWorkspaceNow(ctx, workspaceId) });
  } catch (error) {
    return jsonError(error);
  }
}

/** Stop following the space; current members stay. */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getSyncProvider();
    refuseAccessToken(ctx, "Linking a Space");
    await unlinkWorkspaceFromSpace(ctx, workspaceId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
