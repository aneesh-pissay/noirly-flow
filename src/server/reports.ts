import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { Comment, FlowUser, Report, Task, WorkspaceMembership } from "@/src/server/models";
import type { ReportReason, ReportTarget } from "@/src/server/models/Report";

const DAILY_LIMIT = 20;

export type CreateReportInput = {
  targetType: ReportTarget;
  targetId: string;
  /** Required for `user` reports: the workspace you share with them. */
  workspaceId?: string;
  reason: ReportReason;
  details?: string | null;
};

const oid = (id: string) => new Types.ObjectId(id);

async function isMember(workspaceId: Types.ObjectId | string, userId: Types.ObjectId | string) {
  return Boolean(await WorkspaceMembership.exists({ workspaceId, userId }));
}

/**
 * Files a report. The reporter must be a member of the workspace the reported
 * thing lives in, can't report themselves or their own content, and can't
 * stack duplicate open reports on the same thing.
 */
export async function createReport(reporterId: string, input: CreateReportInput) {
  if (!Types.ObjectId.isValid(input.targetId)) throw new ApiError(400, "invalid_request", "Invalid report target");

  let workspaceId: Types.ObjectId;
  let targetUserId: Types.ObjectId | null = null;
  let excerpt: string | null = null;

  if (input.targetType === "comment") {
    const comment = await Comment.findById(input.targetId).lean();
    if (!comment || comment.deletedAt) throw new ApiError(404, "not_found", "Comment not found");
    workspaceId = comment.workspaceId;
    targetUserId = comment.authorId;
    excerpt = comment.body.slice(0, 2000);
  } else if (input.targetType === "task") {
    const task = await Task.findById(input.targetId).lean();
    if (!task || task.deletedAt) throw new ApiError(404, "not_found", "Task not found");
    workspaceId = task.workspaceId;
    targetUserId = task.createdById;
    excerpt = [task.title, task.description].filter(Boolean).join("\n\n").slice(0, 2000);
  } else {
    if (!input.workspaceId || !Types.ObjectId.isValid(input.workspaceId)) {
      throw new ApiError(400, "invalid_request", "workspaceId is required to report a member");
    }
    workspaceId = oid(input.workspaceId);
    const user = await FlowUser.findById(input.targetId).lean();
    if (!user || !(await isMember(workspaceId, user._id))) throw new ApiError(404, "not_found", "Member not found");
    targetUserId = user._id;
    excerpt = user.displayName;
  }

  if (!(await isMember(workspaceId, reporterId))) throw new ApiError(404, "not_found", "Not found");
  if (targetUserId && String(targetUserId) === reporterId) {
    throw new ApiError(400, "invalid_request", "You can't report yourself or your own content");
  }

  const existing = await Report.findOne({
    reporterId: oid(reporterId),
    targetType: input.targetType,
    targetId: oid(input.targetId),
    status: "open",
  }).lean();
  if (existing) return { id: String(existing._id), duplicate: true };

  const since = new Date(Date.now() - 24 * 3600_000);
  if ((await Report.countDocuments({ reporterId: oid(reporterId), createdAt: { $gte: since } })) >= DAILY_LIMIT) {
    throw new ApiError(429, "rate_limited", "Too many reports today. Please try again tomorrow.");
  }

  const report = await Report.create({
    workspaceId,
    reporterId: oid(reporterId),
    targetType: input.targetType,
    targetId: oid(input.targetId),
    targetUserId,
    reason: input.reason,
    details: input.details?.trim() || null,
    excerpt,
  });
  return { id: String(report._id), duplicate: false };
}
