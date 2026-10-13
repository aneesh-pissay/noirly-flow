import { readApiJson } from "@/src/server/security/body";
import {
  ApiError,
  assertObjectId,
  getSyncProvider,
  jsonError,
  jsonOk,
} from "@/src/server/api/http";
import { updateMemberBodySchema } from "@/src/server/api/schemas";
import { removeMember, updateMemberRole } from "@/src/server/workspace/members";

type Params = { params: Promise<{ workspaceId: string; userId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { workspaceId, userId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    await assertObjectId(userId, "userId");
    const body = updateMemberBodySchema.safeParse(await readApiJson(request));
    if (!body.success) {
      throw new ApiError(400, "invalid_request", "Invalid role");
    }
    const { ctx } = await getSyncProvider();
    const member = await updateMemberRole({
      actorId: ctx.userId,
      workspaceId,
      targetUserId: userId,
      role: body.data.role,
    });
    return jsonOk({ member });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { workspaceId, userId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    await assertObjectId(userId, "userId");
    const { ctx } = await getSyncProvider();
    await removeMember({
      actorId: ctx.userId,
      workspaceId,
      targetUserId: userId,
    });
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
