import { readApiJson } from "@/src/server/security/body";
import { ApiError, assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { importTasksBodySchema } from "@/src/server/api/schemas";
import { runImport } from "@/src/server/import";
import type { ImportTask } from "@/src/core/import";

type Params = { params: Promise<{ projectId: string }> };

export const maxDuration = 300;
/** Room for a full import plan (2000 tasks with notes); other JSON routes keep 256 KB. */
const MAX_BODY = 8 * 1024 * 1024;

/** Creates the tasks of an import plan (see src/core/import.ts) in this project. */
export async function POST(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    await assertObjectId(projectId, "projectId");
    const body = importTasksBodySchema.safeParse(await readApiJson(request, MAX_BODY));
    if (!body.success) throw new ApiError(400, "invalid_request", body.error.issues[0]?.message ?? "Invalid import");
    const { ctx } = await getSyncProvider();
    return jsonOk(await runImport(ctx.userId, projectId, body.data.tasks as ImportTask[]), 201);
  } catch (error) {
    return jsonError(error);
  }
}
