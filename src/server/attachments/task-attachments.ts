import { Types } from "mongoose";
import { safeAttachmentMime } from "./content-type";
import { withDb } from "@/src/server/db/mongodb";
import { Task, TaskAttachment } from "@/src/server/models";
import { ApiError } from "@/src/server/api/http";
import { recordActivity } from "@/src/server/activity";
import { requireWorkspaceRole } from "@/src/server/workspace/members";
import {
  putAttachment,
  readAttachment,
  removeAttachment,
  type StoredObject,
} from "@/src/server/storage/attachments";
import type { TaskAttachment as TaskAttachmentView } from "@/src/core/sync/types";

/** Kept under the proxy's request-body buffer (next.config.ts) with room for multipart overhead. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_TASK = 20;

/**
 * Types a browser may render inline. Everything else downloads, so an
 * uploaded HTML or SVG file can never run as a page on Flow's own origin.
 */
const INLINE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
]);

function mapAttachment(doc: {
  _id: Types.ObjectId;
  taskId: Types.ObjectId;
  uploadedById: Types.ObjectId;
  filename: string;
  mime: string;
  sizeBytes: number;
  createdAt: Date;
}): TaskAttachmentView {
  return {
    id: doc._id.toString(),
    taskId: doc.taskId.toString(),
    uploadedById: doc.uploadedById.toString(),
    filename: doc.filename,
    mime: doc.mime,
    sizeBytes: doc.sizeBytes,
    url: `/api/attachments/${doc._id.toString()}`,
    createdAt: doc.createdAt.toISOString(),
  };
}

async function requireTask(userId: string, taskId: string, min: "viewer" | "member") {
  const task = await Task.findById(taskId).select("workspaceId projectId deletedAt").lean();
  if (!task || task.deletedAt) throw new ApiError(404, "not_found", "Task not found");
  const role = await requireWorkspaceRole(userId, task.workspaceId.toString(), min);
  return { task, role };
}

/** A filename safe for a header and the UI: no paths, no control characters. */
function cleanFilename(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 255);
  return cleaned || "file";
}

export async function listAttachments(userId: string, taskId: string) {
  return withDb(async () => {
    await requireTask(userId, taskId, "viewer");
    const docs = await TaskAttachment.find({ taskId: new Types.ObjectId(taskId), deletedAt: null })
      .sort({ createdAt: 1 })
      .lean();
    return docs.map(mapAttachment);
  });
}

export async function addAttachment(
  userId: string,
  taskId: string,
  file: { name: string; type: string; size: number; body: Buffer },
) {
  return withDb(async () => {
    const { task } = await requireTask(userId, taskId, "member");
    if (file.size === 0) throw new ApiError(400, "invalid_request", "That file is empty");
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new ApiError(413, "too_large", "Files can be up to 25 MB");
    }
    const count = await TaskAttachment.countDocuments({ taskId: task._id, deletedAt: null });
    if (count >= MAX_ATTACHMENTS_PER_TASK) {
      throw new ApiError(400, "invalid_request", `A task can have up to ${MAX_ATTACHMENTS_PER_TASK} attachments`);
    }

    const mime = safeAttachmentMime(file.type, file.body);
    const stored = await putAttachment(task.workspaceId.toString(), file.body, mime).catch((error: Error) => {
      console.error("attachment upload failed");
      throw new ApiError(503, "storage_unavailable", error.message.includes("not configured")
        ? "Attachments aren't set up on this server yet."
        : "The file couldn't be stored. Try again.");
    });
    const doc = await TaskAttachment.create({
      workspaceId: task.workspaceId,
      taskId: task._id,
      uploadedById: new Types.ObjectId(userId),
      filename: cleanFilename(file.name),
      mime,
      sizeBytes: file.size,
      storage: stored.storage,
      key: stored.key,
    });
    void recordActivity({
      workspaceId: task.workspaceId,
      projectId: task.projectId,
      taskId: task._id,
      actorId: userId,
      verb: "attachment.added",
      metadata: { filename: doc.filename },
    }).catch(() => console.error("recordActivity failed"));
    return mapAttachment(doc);
  });
}

/** The file and how to serve it, after checking the viewer belongs to its workspace. */
export async function openAttachment(userId: string, attachmentId: string) {
  return withDb(async () => {
    const doc = await TaskAttachment.findById(attachmentId).lean();
    if (!doc || doc.deletedAt) throw new ApiError(404, "not_found", "Attachment not found");
    await requireTask(userId, doc.taskId.toString(), "viewer");
    const bytes = await readAttachment({ storage: doc.storage, key: doc.key } as StoredObject);
    return {
      bytes,
      filename: doc.filename,
      mime: INLINE_TYPES.has(doc.mime) ? doc.mime : "application/octet-stream",
      inline: INLINE_TYPES.has(doc.mime),
    };
  });
}

/** The uploader can remove their own files; admins and owners can remove any. */
export async function deleteAttachment(userId: string, attachmentId: string) {
  return withDb(async () => {
    const doc = await TaskAttachment.findById(attachmentId);
    if (!doc || doc.deletedAt) throw new ApiError(404, "not_found", "Attachment not found");
    const { role } = await requireTask(userId, doc.taskId.toString(), "member");
    if (doc.uploadedById.toString() !== userId && role !== "admin" && role !== "owner") {
      throw new ApiError(403, "forbidden", "Only the uploader or an admin can remove this file");
    }
    doc.deletedAt = new Date();
    await doc.save();
    await removeAttachment({ storage: doc.storage, key: doc.key } as StoredObject);
    return { taskId: doc.taskId.toString() };
  });
}

/** Deletes stored files for attachments matching a filter (workspace or account deletion). */
export async function purgeAttachments(filter: Record<string, unknown>) {
  const docs = await TaskAttachment.find(filter).select("storage key").lean();
  await Promise.all(docs.map((d) => removeAttachment({ storage: d.storage, key: d.key } as StoredObject)));
  await TaskAttachment.deleteMany(filter);
}
