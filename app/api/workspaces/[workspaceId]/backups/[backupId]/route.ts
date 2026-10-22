import { assertObjectId, getSyncProvider, jsonError } from "@/src/server/api/http";
import { readBackup } from "@/src/server/backups";
import { fileSlug } from "@/src/core/export";

type Params = { params: Promise<{ workspaceId: string; backupId: string }> };

/** Downloads one backup: the workspace's JSON export, gzipped. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { workspaceId, backupId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    await assertObjectId(backupId, "backupId");
    const { ctx } = await getSyncProvider();
    const { body, createdAt, name } = await readBackup(ctx.userId, workspaceId, backupId);
    const stamp = createdAt.toISOString().slice(0, 16).replace(":", "");
    return new Response(Buffer.from(body), {
      headers: {
        "content-type": "application/gzip",
        "content-disposition": `attachment; filename="${fileSlug(name)}-backup-${stamp}.json.gz"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
