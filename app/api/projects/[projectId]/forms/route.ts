import { readApiJson } from "@/src/server/security/body";
import { ApiError, assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { createFormBodySchema } from "@/src/server/api/schemas";
import { createForm, listForms } from "@/src/server/forms";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    await assertObjectId(projectId, "projectId");
    const { ctx } = await getSyncProvider();
    return jsonOk({ forms: await listForms(ctx.userId, projectId) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    await assertObjectId(projectId, "projectId");
    const body = createFormBodySchema.safeParse(await readApiJson(request));
    if (!body.success) throw new ApiError(400, "invalid_request", "Invalid form");
    const { ctx } = await getSyncProvider();
    return jsonOk({ form: await createForm(ctx.userId, projectId, body.data) }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
