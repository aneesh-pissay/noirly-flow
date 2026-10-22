import { readApiJson } from "@/src/server/security/body";
import { ApiError, assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { createAutomationBodySchema } from "@/src/server/api/schemas";
import { createRule, listRules } from "@/src/server/automations";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    await assertObjectId(projectId, "projectId");
    const { ctx } = await getSyncProvider();
    return jsonOk({ rules: await listRules(ctx.userId, projectId) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    await assertObjectId(projectId, "projectId");
    const body = createAutomationBodySchema.safeParse(await readApiJson(request));
    if (!body.success) throw new ApiError(400, "invalid_request", "Invalid automation");
    const { ctx } = await getSyncProvider();
    return jsonOk({ rule: await createRule(ctx.userId, projectId, body.data) }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
