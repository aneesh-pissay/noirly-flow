import { readApiJson } from "@/src/server/security/body";
import { ApiError, assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { milestoneBodySchema } from "@/src/server/api/schemas";
import { addMilestone } from "@/src/server/goals";

type Params = { params: Promise<{ goalId: string }> };

/** Adds a milestone; returns the whole goal. */
export async function POST(request: Request, { params }: Params) {
  try {
    const { goalId } = await params;
    await assertObjectId(goalId, "goalId");
    const body = milestoneBodySchema.safeParse(await readApiJson(request));
    if (!body.success) throw new ApiError(400, "invalid_request", "Invalid milestone");
    const { ctx } = await getSyncProvider();
    return jsonOk({ goal: await addMilestone(ctx.userId, goalId, body.data) }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
