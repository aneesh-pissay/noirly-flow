import { assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { deleteTemplate } from "@/src/server/templates";

type Params = { params: Promise<{ templateId: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { templateId } = await params;
    await assertObjectId(templateId, "templateId");
    const { ctx } = await getSyncProvider();
    await deleteTemplate(ctx.userId, templateId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
