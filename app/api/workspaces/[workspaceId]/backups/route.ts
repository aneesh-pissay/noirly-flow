import { readApiJson } from "@/src/server/security/body";
import { ApiError, assertObjectId, getSyncProvider, jsonError, jsonOk, refuseAccessToken } from "@/src/server/api/http";
import { backupScheduleBodySchema } from "@/src/server/api/schemas";
import { getBackupSettings, setBackupSchedule } from "@/src/server/backups";

type Params = { params: Promise<{ workspaceId: string }> };

/** The backup schedule and the stored backups, newest first (admins). */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getSyncProvider();
    return jsonOk(await getBackupSettings(ctx.userId, workspaceId));
  } catch (error) {
    return jsonError(error);
  }
}

/** Turns scheduled backups on or off, daily or weekly. */
export async function PUT(request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = backupScheduleBodySchema.safeParse(await readApiJson(request));
    if (!body.success) throw new ApiError(400, "invalid_request", "Invalid schedule");
    const { ctx } = await getSyncProvider();
    refuseAccessToken(ctx, "Changing the backup schedule");
    return jsonOk(await setBackupSchedule(ctx.userId, workspaceId, body.data));
  } catch (error) {
    return jsonError(error);
  }
}
