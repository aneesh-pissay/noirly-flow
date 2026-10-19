import { readApiJson } from "@/src/server/security/body";
import { ApiError, assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { decideApprovalBodySchema } from "@/src/server/api/schemas";
import { decideApproval } from "@/src/server/approvals";

type Params = { params: Promise<{ taskId: string }> };

/** The approver approves, or rejects with a note on what to change. */
export async function POST(request: Request, { params }: Params) {
  try {
    const { taskId } = await params;
    await assertObjectId(taskId, "taskId");
    const body = decideApprovalBodySchema.safeParse(await readApiJson(request));
    if (!body.success) throw new ApiError(400, "invalid_request", "Invalid decision");
    const { ctx } = await getSyncProvider();
    return jsonOk({ approval: await decideApproval(ctx.userId, taskId, body.data.decision, body.data.note ?? null) });
  } catch (error) {
    return jsonError(error);
  }
}
