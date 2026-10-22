import { assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { revokeInviteById } from "@/src/server/workspace/members";

type Params = { params: Promise<{ inviteId: string }> };

/** Revokes a pending invite. Admins of its workspace only. */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { inviteId } = await params;
    await assertObjectId(inviteId, "inviteId");
    const { ctx } = await getSyncProvider();
    await revokeInviteById(ctx.userId, inviteId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
