import { assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { backUpNow } from "@/src/server/backups";

type Params = { params: Promise<{ workspaceId: string }> };

export const maxDuration = 60;

/** Makes a backup now (admins; at most every 10 minutes). */
export async function POST(_request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getSyncProvider();
    return jsonOk({ backup: await backUpNow(ctx.userId, workspaceId) }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
