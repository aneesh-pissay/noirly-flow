import { ApiError, assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { revokeAccessToken } from "@/src/server/access-tokens";

type Params = { params: Promise<{ tokenId: string }> };

/** Revokes one of your tokens; it stops working at once. */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { tokenId } = await params;
    await assertObjectId(tokenId, "tokenId");
    const { ctx } = await getSyncProvider();
    if (ctx.via !== "session") throw new ApiError(403, "forbidden", "Manage tokens from Settings while signed in");
    await revokeAccessToken(ctx.userId, tokenId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
