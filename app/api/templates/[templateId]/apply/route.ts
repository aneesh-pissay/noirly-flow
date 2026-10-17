import { readApiJson } from "@/src/server/security/body";
import { scheduleTaskEmails } from "@/src/server/mail/schedule-task-emails";
import { ApiError, assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { applyTemplateBodySchema } from "@/src/server/api/schemas";
import { applyProjectTemplate, applyTaskTemplate } from "@/src/server/templates";

export const maxDuration = 60;

type Params = { params: Promise<{ templateId: string }> };

/**
 * Creates from a template: { kind: "task", projectId, sectionId?, overrides? }
 * makes the task and its subtasks; { kind: "project", name } makes a project
 * with the template's sections and tasks.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { templateId } = await params;
    await assertObjectId(templateId, "templateId");
    const body = applyTemplateBodySchema.safeParse(await readApiJson(request));
    if (!body.success) throw new ApiError(400, "invalid_request", "Invalid template use");
    const { ctx, sync } = await getSyncProvider();
    if (body.data.kind === "task") {
      const task = await applyTaskTemplate(sync, ctx.userId, templateId, body.data);
      scheduleTaskEmails();
      return jsonOk({ task }, 201);
    }
    const project = await applyProjectTemplate(sync, ctx.userId, templateId, body.data);
    return jsonOk({ project }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
