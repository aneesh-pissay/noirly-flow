import {
  assertObjectId,
  getSyncProvider,
  jsonError,
  jsonOk,
} from "@/src/server/api/http";

type Params = { params: Promise<{ workspaceId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { sync } = await getSyncProvider();
    const items = await sync.listTrash(workspaceId);
    return jsonOk({ items });
  } catch (error) {
    return jsonError(error);
  }
}
