import { readApiJson } from "@/src/server/security/body";
import { ApiError, assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { createFieldBodySchema } from "@/src/server/api/schemas";
import { createField, listFields } from "@/src/server/fields";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    await assertObjectId(projectId, "projectId");
    const { ctx } = await getSyncProvider();
    return jsonOk({ fields: await listFields(ctx.userId, projectId) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    await assertObjectId(projectId, "projectId");
    const body = createFieldBodySchema.safeParse(await readApiJson(request));
    if (!body.success) throw new ApiError(400, "invalid_request", "Invalid field");
    const { ctx } = await getSyncProvider();
    return jsonOk({ field: await createField(ctx.userId, projectId, body.data) }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
