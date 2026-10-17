import { z } from "zod";
import { readApiJson } from "@/src/server/security/body";
import { ApiError, assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { setMemberCapacity } from "@/src/server/workspace/members";

type Params = { params: Promise<{ workspaceId: string; userId: string }> };

/** Minutes for each weekday, Sunday first. */
const bodySchema = z.object({ minutes: z.array(z.number().int().min(0).max(1440)).length(7) });

/** Sets a member's hours per weekday: your own, or anyone's as an admin. */
export async function PUT(request: Request, { params }: Params) {
  try {
    const { workspaceId, userId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    await assertObjectId(userId, "userId");
    const body = bodySchema.safeParse(await readApiJson(request));
    if (!body.success) throw new ApiError(400, "invalid_request", "Give minutes for each of the 7 weekdays (0–1440)");
    const { ctx } = await getSyncProvider();
    const capacityMinutes = await withDb(() => setMemberCapacity(ctx.userId, workspaceId, userId, body.data.minutes));
    return jsonOk({ capacityMinutes });
  } catch (error) {
    return jsonError(error);
  }
}
