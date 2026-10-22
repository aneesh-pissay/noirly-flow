import { gzipSync } from "node:zlib";
import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Workspace, WorkspaceBackup, type WorkspaceBackupDocument } from "@/src/server/models";
import { requireWorkspaceRole } from "@/src/server/workspace/members";
import { buildWorkspaceExport } from "@/src/server/export";
import { canStoreFiles, putAttachment, readAttachment, removeAttachment } from "@/src/server/storage/attachments";

const oid = (id: string | Types.ObjectId) => new Types.ObjectId(String(id));
/** Backups kept per workspace; older ones are deleted as new ones land. */
export const KEEP_BACKUPS = 5;
/** How long after the last backup the next scheduled one is due (a little under the period, so a daily cron keeps up). */
const DUE_AFTER_MS = { daily: 20 * 3600_000, weekly: 6.5 * 86_400_000 } as const;
/** "Back up now" at most this often. */
const MANUAL_GAP_MS = 10 * 60_000;
const CRON_BATCH = 20;

export type BackupView = { id: string; createdAt: string; sizeBytes: number; taskCount: number; trigger: "scheduled" | "manual" };
export type BackupSettings = { available: boolean; enabled: boolean; frequency: "daily" | "weekly"; lastRunAt: string | null; backups: BackupView[] };

const view = (doc: WorkspaceBackupDocument): BackupView => ({
  id: String(doc._id), createdAt: doc.createdAt.toISOString(), sizeBytes: doc.sizeBytes, taskCount: doc.taskCount, trigger: doc.trigger as BackupView["trigger"],
});

/** Makes one backup, then deletes the oldest past KEEP_BACKUPS. Call inside withDb. */
async function runBackup(workspaceId: string, trigger: "scheduled" | "manual", userId: string | null) {
  const data = await buildWorkspaceExport(workspaceId);
  const body = gzipSync(Buffer.from(JSON.stringify(data)));
  const object = await putAttachment(workspaceId, body, "application/gzip", "backups");
  const doc = await WorkspaceBackup.create({
    workspaceId: oid(workspaceId), ...object, sizeBytes: body.length, taskCount: data.tasks.length, trigger, createdById: userId ? oid(userId) : null,
  });
  await Workspace.updateOne({ _id: oid(workspaceId) }, { $set: { "backup.lastRunAt": new Date() } });
  const old = await WorkspaceBackup.find({ workspaceId: oid(workspaceId) }).sort({ createdAt: -1 }).skip(KEEP_BACKUPS).lean();
  for (const backup of old) {
    await removeAttachment({ storage: backup.storage as "r2" | "local", key: backup.key });
    await WorkspaceBackup.deleteOne({ _id: backup._id });
  }
  return view(doc.toObject());
}

export function getBackupSettings(userId: string, workspaceId: string) {
  return withDb(async (): Promise<BackupSettings> => {
    await requireWorkspaceRole(userId, workspaceId, "admin");
    const workspace = await Workspace.findById(oid(workspaceId)).select("backup").lean();
    if (!workspace) throw new ApiError(404, "not_found", "Workspace not found");
    const backups = await WorkspaceBackup.find({ workspaceId: oid(workspaceId) }).sort({ createdAt: -1 }).limit(KEEP_BACKUPS).lean();
    return {
      available: canStoreFiles(),
      enabled: Boolean(workspace.backup?.enabled),
      frequency: (workspace.backup?.frequency ?? "weekly") as BackupSettings["frequency"],
      lastRunAt: workspace.backup?.lastRunAt ? workspace.backup.lastRunAt.toISOString() : null,
      backups: backups.map((b) => view(b as WorkspaceBackupDocument)),
    };
  });
}

export function setBackupSchedule(userId: string, workspaceId: string, input: { enabled: boolean; frequency: "daily" | "weekly" }) {
  return withDb(async () => {
    await requireWorkspaceRole(userId, workspaceId, "admin");
    if (input.enabled && !canStoreFiles()) throw new ApiError(503, "unavailable", "Backups need file storage, which isn't set up here");
    await Workspace.updateOne({ _id: oid(workspaceId) }, { $set: { "backup.enabled": input.enabled, "backup.frequency": input.frequency } });
  }).then(() => getBackupSettings(userId, workspaceId));
}

export function backUpNow(userId: string, workspaceId: string) {
  return withDb(async () => {
    await requireWorkspaceRole(userId, workspaceId, "admin");
    if (!canStoreFiles()) throw new ApiError(503, "unavailable", "Backups need file storage, which isn't set up here");
    const latest = await WorkspaceBackup.findOne({ workspaceId: oid(workspaceId), trigger: "manual" }).sort({ createdAt: -1 }).select("createdAt").lean();
    if (latest && Date.now() - latest.createdAt.getTime() < MANUAL_GAP_MS) {
      throw new ApiError(429, "rate_limited", "A backup was just made. Try again in a few minutes.");
    }
    return runBackup(workspaceId, "manual", userId);
  });
}

/** The stored file for a backup, for its admin to download. */
export function readBackup(userId: string, workspaceId: string, backupId: string) {
  return withDb(async () => {
    await requireWorkspaceRole(userId, workspaceId, "admin");
    const backup = await WorkspaceBackup.findOne({ _id: oid(backupId), workspaceId: oid(workspaceId) }).lean();
    if (!backup) throw new ApiError(404, "not_found", "Backup not found");
    const workspace = await Workspace.findById(oid(workspaceId)).select("name").lean();
    const body = await readAttachment({ storage: backup.storage as "r2" | "local", key: backup.key });
    return { body, createdAt: backup.createdAt, name: workspace?.name ?? "workspace" };
  });
}

/** For the cron: backs up the workspaces that are due, oldest first, a batch at a time. */
export function runDueBackups(limit = CRON_BATCH) {
  return withDb(async () => {
    if (!canStoreFiles()) return { attempted: 0, made: 0, skipped: "no storage" as const };
    const now = Date.now();
    const candidates = await Workspace.find({ "backup.enabled": true }).select("backup").sort({ "backup.lastRunAt": 1 }).limit(limit * 5).lean();
    const due = candidates.filter((w) => {
      const last = w.backup?.lastRunAt?.getTime() ?? 0;
      return now - last >= DUE_AFTER_MS[(w.backup?.frequency ?? "weekly") as "daily" | "weekly"];
    }).slice(0, limit);
    let made = 0;
    for (const workspace of due) {
      try {
        await runBackup(String(workspace._id), "scheduled", null);
        made += 1;
      } catch {
        console.error("Scheduled backup failed; it will be tried on the next run.");
      }
    }
    return { attempted: due.length, made };
  });
}
