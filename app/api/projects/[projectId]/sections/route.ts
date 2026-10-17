import { readApiJson } from "@/src/server/security/body";
import { ApiError, assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { createSectionBodySchema } from "@/src/server/api/schemas";
import { createSection, listSections } from "@/src/server/sections";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    await assertObjectId(projectId, "projectId");
    const { ctx } = await getSyncProvider();
    return jsonOk({ sections: await listSections(ctx.userId, projectId) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    await assertObjectId(projectId, "projectId");
    const body = createSectionBodySchema.safeParse(await readApiJson(request));
    if (!body.success) throw new ApiError(400, "invalid_request", "Invalid section");
    const { ctx } = await getSyncProvider();
    return jsonOk({ section: await createSection(ctx.userId, projectId, body.data.name) }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
