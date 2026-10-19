import { readApiJson } from "@/src/server/security/body";
import { ApiError, assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { requestApprovalBodySchema } from "@/src/server/api/schemas";
import { requestApproval, withdrawApproval } from "@/src/server/approvals";

type Params = { params: Promise<{ taskId: string }> };

/** Asks a member to approve the task; it can't be done until they do. */
export async function POST(request: Request, { params }: Params) {
  try {
    const { taskId } = await params;
    await assertObjectId(taskId, "taskId");
    const body = requestApprovalBodySchema.safeParse(await readApiJson(request));
    if (!body.success) throw new ApiError(400, "invalid_request", "Choose an approver");
    const { ctx } = await getSyncProvider();
    return jsonOk({ approval: await requestApproval(ctx.userId, taskId, body.data.approverId) }, 201);
  } catch (error) {
    return jsonError(error);
  }
}

/** Withdraws the approval (the requester or an admin). */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { taskId } = await params;
    await assertObjectId(taskId, "taskId");
    const { ctx } = await getSyncProvider();
    return jsonOk({ approval: await withdrawApproval(ctx.userId, taskId) });
  } catch (error) {
    return jsonError(error);
  }
}
