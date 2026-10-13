import { Types } from "mongoose";
import { withDb } from "@/src/server/db/mongodb";
import { Project, ProjectMessage } from "@/src/server/models";
import { ApiError } from "@/src/server/api/http";
import { requireWorkspaceRole } from "@/src/server/workspace/members";
import type { ChatMessage } from "@/src/core/sync/types";

export const CHAT_PAGE_SIZE = 50;

function mapMessage(doc: {
  _id: Types.ObjectId;
  projectId: Types.ObjectId;
  authorId: Types.ObjectId;
  body: string;
  createdAt: Date;
}): ChatMessage {
  return {
    id: doc._id.toString(),
    projectId: doc.projectId.toString(),
    authorId: doc.authorId.toString(),
    body: doc.body,
    createdAt: doc.createdAt.toISOString(),
  };
}

/** The live project, after checking the caller's role in its workspace. */
async function requireProject(userId: string, projectId: string, min: "viewer" | "member") {
  const project = await Project.findById(projectId).select("workspaceId deletedAt").lean();
  if (!project || project.deletedAt) {
    throw new ApiError(404, "not_found", "Project not found");
  }
  const role = await requireWorkspaceRole(userId, project.workspaceId.toString(), min);
  return { project, role };
}

/**
 * One page of a project's chat, oldest first. `before` is a message id; pages
 * walk back in time from there (or from the newest message).
 */
export async function listMessages(userId: string, projectId: string, before?: string) {
  return withDb(async () => {
    await requireProject(userId, projectId, "viewer");
    const filter: Record<string, unknown> = {
      projectId: new Types.ObjectId(projectId),
      deletedAt: null,
    };
    if (before) filter._id = { $lt: new Types.ObjectId(before) };
    const docs = await ProjectMessage.find(filter)
      .sort({ _id: -1 })
      .limit(CHAT_PAGE_SIZE + 1)
      .lean();
    const hasMore = docs.length > CHAT_PAGE_SIZE;
    const page = docs.slice(0, CHAT_PAGE_SIZE).reverse().map(mapMessage);
    return { messages: page, hasMore };
  });
}

/** Members and above can post; viewers read along. */
export async function createMessage(userId: string, projectId: string, body: string) {
  return withDb(async () => {
    const { project } = await requireProject(userId, projectId, "member");
    const text = body.trim();
    if (!text) throw new ApiError(400, "invalid_request", "Message cannot be empty");
    const doc = await ProjectMessage.create({
      workspaceId: project.workspaceId,
      projectId: project._id,
      authorId: new Types.ObjectId(userId),
      body: text,
    });
    return mapMessage(doc);
  });
}

/** Authors can delete their own messages; admins and owners can delete any. */
export async function deleteMessage(userId: string, projectId: string, messageId: string) {
  return withDb(async () => {
    const { role } = await requireProject(userId, projectId, "viewer");
    const message = await ProjectMessage.findOne({
      _id: new Types.ObjectId(messageId),
      projectId: new Types.ObjectId(projectId),
      deletedAt: null,
    });
    if (!message) throw new ApiError(404, "not_found", "Message not found");
    const isAuthor = message.authorId.toString() === userId;
    if (!isAuthor && role !== "admin" && role !== "owner") {
      throw new ApiError(403, "forbidden", "You can only delete your own messages");
    }
    message.deletedAt = new Date();
    await message.save();
  });
}
