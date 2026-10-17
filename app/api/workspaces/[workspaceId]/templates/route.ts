import { readApiJson } from "@/src/server/security/body";
import { ApiError, assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { saveTemplateBodySchema } from "@/src/server/api/schemas";
import { listTemplates, saveProjectTemplate, saveTaskTemplate } from "@/src/server/templates";

type Params = { params: Promise<{ workspaceId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getSyncProvider();
    return jsonOk({ templates: await listTemplates(ctx.userId, workspaceId) });
  } catch (error) {
    return jsonError(error);
  }
}

/** Saves a template from a task ({ kind: "task", taskId, name }) or a project ({ kind: "project", projectId, name }). */
export async function POST(request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = saveTemplateBodySchema.safeParse(await readApiJson(request));
    if (!body.success) throw new ApiError(400, "invalid_request", "Invalid template");
    const { ctx } = await getSyncProvider();
    const template = body.data.kind === "task"
      ? (await assertObjectId(body.data.taskId, "taskId"), await saveTaskTemplate(ctx.userId, workspaceId, body.data.taskId, body.data.name))
      : (await assertObjectId(body.data.projectId, "projectId"), await saveProjectTemplate(ctx.userId, workspaceId, body.data.projectId, body.data.name));
    return jsonOk({ template }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
