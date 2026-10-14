import { readApiJson } from "@/src/server/security/body";
import {
  ApiError,
  assertObjectId,
  getSyncProvider,
  jsonError,
  jsonOk,
} from "@/src/server/api/http";
import { createColumnBodySchema, reorderColumnsBodySchema } from "@/src/server/api/schemas";
import { publishRealtime } from "@/src/server/realtime/publish";

type Params = { params: Promise<{ projectId: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    await assertObjectId(projectId, "projectId");
    const body = createColumnBodySchema.safeParse(await readApiJson(request));
    if (!body.success) {
      throw new ApiError(400, "invalid_request", "Invalid column");
    }
    const { sync } = await getSyncProvider();
    const columns = await sync.createColumn(projectId, body.data);
    void publishRealtime({ channel: `project:${projectId}`, event: "columns.changed", data: { projectId, columns } });
    return jsonOk({ columns }, 201);
  } catch (error) {
    return jsonError(error);
  }
}

/** Reorders the board: `columnIds` lists every column, left to right. */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    await assertObjectId(projectId, "projectId");
    const body = reorderColumnsBodySchema.safeParse(await readApiJson(request));
    if (!body.success) {
      throw new ApiError(400, "invalid_request", "Invalid column order");
    }
    const { sync } = await getSyncProvider();
    const columns = await sync.reorderColumns(projectId, body.data.columnIds);
    void publishRealtime({ channel: `project:${projectId}`, event: "columns.changed", data: { projectId, columns } });
    return jsonOk({ columns });
  } catch (error) {
    return jsonError(error);
  }
}
