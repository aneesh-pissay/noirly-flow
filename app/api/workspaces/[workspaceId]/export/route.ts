import { ApiError, assertObjectId, getSyncProvider, jsonError } from "@/src/server/api/http";
import { exportTasksCsv, exportWorkspaceJson } from "@/src/server/export";
import { fileSlug } from "@/src/core/export";

type Params = { params: Promise<{ workspaceId: string }> };

export const maxDuration = 60;

/** ?format=json (admins: everything) or ?format=csv (anyone in it: the tasks), as a download. */
export async function GET(request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const format = new URL(request.url).searchParams.get("format") ?? "json";
    if (format !== "json" && format !== "csv") throw new ApiError(400, "invalid_request", "format must be json or csv");
    const { ctx } = await getSyncProvider();
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "csv") {
      const { name, csv } = await exportTasksCsv(ctx.userId, workspaceId);
      return new Response(csv, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${fileSlug(name)}-tasks-${stamp}.csv"`,
          "cache-control": "no-store",
        },
      });
    }
    const data = await exportWorkspaceJson(ctx.userId, workspaceId);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${fileSlug(data.workspace.name)}-export-${stamp}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
