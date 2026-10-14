import { readApiJson } from "@/src/server/security/body";
import {
  ApiError,
  assertObjectId,
  getSyncProvider,
  jsonError,
  jsonOk,
} from "@/src/server/api/http";
import { updateColumnBodySchema } from "@/src/server/api/schemas";
import { publishRealtime } from "@/src/server/realtime/publish";

type Params = { params: Promise<{ columnId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { columnId } = await params;
    await assertObjectId(columnId, "columnId");
    const body = updateColumnBodySchema.safeParse(await readApiJson(request));
    if (!body.success) {
      throw new ApiError(400, "invalid_request", "Invalid column");
    }
    const { sync } = await getSyncProvider();
    const { projectId, columns } = await sync.updateColumn(columnId, body.data);
    void publishRealtime({ channel: `project:${projectId}`, event: "columns.changed", data: { projectId, columns } });
    return jsonOk({ columns });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { columnId } = await params;
    await assertObjectId(columnId, "columnId");
    const { sync } = await getSyncProvider();
    const { projectId, columns } = await sync.deleteColumn(columnId);
    // Its cards moved column, so boards refetch tasks as well as columns.
    void publishRealtime({ channel: `project:${projectId}`, event: "columns.changed", data: { projectId, columns, tasksMoved: true } });
    return jsonOk({ columns });
  } catch (error) {
    return jsonError(error);
  }
}
