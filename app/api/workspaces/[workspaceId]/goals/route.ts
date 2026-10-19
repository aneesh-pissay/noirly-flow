import { readApiJson } from "@/src/server/security/body";
import { ApiError, assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { createGoalBodySchema } from "@/src/server/api/schemas";
import { createGoal, listGoals } from "@/src/server/goals";

type Params = { params: Promise<{ workspaceId: string }> };

/** Every goal in the workspace (archived ones too), with task progress. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getSyncProvider();
    return jsonOk({ goals: await listGoals(ctx.userId, workspaceId) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = createGoalBodySchema.safeParse(await readApiJson(request));
    if (!body.success) throw new ApiError(400, "invalid_request", "Invalid goal");
    const { ctx } = await getSyncProvider();
    return jsonOk({ goal: await createGoal(ctx.userId, workspaceId, body.data) }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
