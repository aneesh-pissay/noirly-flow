import { z } from "zod";
import { readApiJson } from "@/src/server/security/body";
import { ApiError, assertObjectId, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { listFavoriteProjects, setFavoriteProject } from "@/src/server/favorites";

const bodySchema = z.object({ projectId: z.string().min(1), favorite: z.boolean() });

export async function GET() {
  try {
    const { ctx } = await getSyncProvider();
    return jsonOk({ projectIds: await listFavoriteProjects(ctx.userId) });
  } catch (error) {
    return jsonError(error);
  }
}

/** { projectId, favorite } stars or unstars one project for the caller. */
export async function PUT(request: Request) {
  try {
    const body = bodySchema.safeParse(await readApiJson(request));
    if (!body.success) throw new ApiError(400, "invalid_request", "Invalid favourite");
    await assertObjectId(body.data.projectId, "projectId");
    const { ctx } = await getSyncProvider();
    return jsonOk({ projectIds: await setFavoriteProject(ctx.userId, body.data.projectId, body.data.favorite) });
  } catch (error) {
    return jsonError(error);
  }
}
