import { readApiJson } from "@/src/server/security/body";
import { ApiError, assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { updateGoalBodySchema } from "@/src/server/api/schemas";
import { deleteGoal, getGoal, updateGoal } from "@/src/server/goals";

type Params = { params: Promise<{ goalId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { goalId } = await params;
    await assertObjectId(goalId, "goalId");
    const { ctx } = await getSyncProvider();
    return jsonOk({ goal: await getGoal(ctx.userId, goalId) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { goalId } = await params;
    await assertObjectId(goalId, "goalId");
    const body = updateGoalBodySchema.safeParse(await readApiJson(request));
    if (!body.success) throw new ApiError(400, "invalid_request", "Invalid goal");
    const { ctx } = await getSyncProvider();
    return jsonOk({ goal: await updateGoal(ctx.userId, goalId, body.data) });
  } catch (error) {
    return jsonError(error);
  }
}

/** Deletes the goal; its tasks stay, unlinked. */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { goalId } = await params;
    await assertObjectId(goalId, "goalId");
    const { ctx } = await getSyncProvider();
    await deleteGoal(ctx.userId, goalId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
