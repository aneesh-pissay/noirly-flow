import { readApiJson } from "@/src/server/security/body";
import { ApiError, assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { updateMilestoneBodySchema } from "@/src/server/api/schemas";
import { deleteMilestone, updateMilestone } from "@/src/server/goals";

type Params = { params: Promise<{ goalId: string; milestoneId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { goalId, milestoneId } = await params;
    await assertObjectId(goalId, "goalId");
    await assertObjectId(milestoneId, "milestoneId");
    const body = updateMilestoneBodySchema.safeParse(await readApiJson(request));
    if (!body.success) throw new ApiError(400, "invalid_request", "Invalid milestone");
    const { ctx } = await getSyncProvider();
    return jsonOk({ goal: await updateMilestone(ctx.userId, goalId, milestoneId, body.data) });
  } catch (error) {
    return jsonError(error);
  }
}

/** Removes the milestone; its tasks stay on the goal. */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { goalId, milestoneId } = await params;
    await assertObjectId(goalId, "goalId");
    await assertObjectId(milestoneId, "milestoneId");
    const { ctx } = await getSyncProvider();
    return jsonOk({ goal: await deleteMilestone(ctx.userId, goalId, milestoneId) });
  } catch (error) {
    return jsonError(error);
  }
}
