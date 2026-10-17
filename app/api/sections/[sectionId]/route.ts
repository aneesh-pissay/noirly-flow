import { readApiJson } from "@/src/server/security/body";
import { ApiError, assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { updateSectionBodySchema } from "@/src/server/api/schemas";
import { deleteSection, updateSection } from "@/src/server/sections";

type Params = { params: Promise<{ sectionId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { sectionId } = await params;
    await assertObjectId(sectionId, "sectionId");
    const body = updateSectionBodySchema.safeParse(await readApiJson(request));
    if (!body.success) throw new ApiError(400, "invalid_request", "Invalid section");
    const { ctx } = await getSyncProvider();
    return jsonOk({ section: await updateSection(ctx.userId, sectionId, body.data) });
  } catch (error) {
    return jsonError(error);
  }
}

/** Deletes the section; its tasks move to "No section". */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { sectionId } = await params;
    await assertObjectId(sectionId, "sectionId");
    const { ctx } = await getSyncProvider();
    await deleteSection(ctx.userId, sectionId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
