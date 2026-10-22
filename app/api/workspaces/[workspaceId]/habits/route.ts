import { assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { listHabits } from "@/src/server/habits";

type Params = { params: Promise<{ workspaceId: string }> };

/** Habits with their current occurrence and history. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getSyncProvider();
    return jsonOk({ habits: await listHabits(ctx.userId, workspaceId) });
  } catch (error) {
    return jsonError(error);
  }
}
