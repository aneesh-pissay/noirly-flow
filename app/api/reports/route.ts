import { ApiError, getSyncProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { createReportBodySchema } from "@/src/server/api/schemas";
import { withDb } from "@/src/server/db/mongodb";
import { createReport } from "@/src/server/reports";

/**
 * Report a comment, task or workspace member to the Noirly team.
 * Body: { targetType, targetId, workspaceId? (members), reason, details? }.
 */
export async function POST(request: Request) {
  try {
    const { ctx } = await getSyncProvider();
    const body = createReportBodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) {
      throw new ApiError(400, "invalid_request", "Invalid report");
    }
    const report = await withDb(() => createReport(ctx.userId, body.data));
    return jsonOk({ report }, report.duplicate ? 200 : 201);
  } catch (error) {
    return jsonError(error);
  }
}
