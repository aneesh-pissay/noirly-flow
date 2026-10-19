import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Task, WorkspaceMembership } from "@/src/server/models";
import { requireWorkspaceRole } from "@/src/server/workspace/members";
import { recordActivity } from "@/src/server/activity";
import { notify } from "@/src/server/notifications";
import { approvalActions } from "@/src/core/approvals";
import { mapApproval } from "@/src/server/mappers";

export { mapApproval };

const oid = (id: string) => new Types.ObjectId(id);

async function load(userId: string, taskId: string) {
  const task = await Task.findOne({ _id: oid(taskId), deletedAt: null });
  if (!task) throw new ApiError(404, "not_found", "Task not found");
  const role = await requireWorkspaceRole(userId, String(task.workspaceId), "viewer");
  return { task, role };
}

function activity(task: { workspaceId: Types.ObjectId; projectId?: Types.ObjectId | null; _id: Types.ObjectId }, actorId: string, verb: string, metadata: Record<string, unknown>) {
  return recordActivity({ workspaceId: task.workspaceId, projectId: task.projectId ?? null, taskId: task._id, actorId, verb, metadata });
}

/** Asks someone (a member who can edit, not yourself) to sign off on the task. */
export function requestApproval(userId: string, taskId: string, approverId: string) {
  return withDb(async () => {
    const { task, role } = await load(userId, taskId);
    if (!approvalActions(mapApproval(task.approval), userId, role).request) {
      throw new ApiError(role === "viewer" ? 403 : 409, role === "viewer" ? "forbidden" : "conflict",
        role === "viewer" ? "Viewers can't request approval" : "An approval is already pending");
    }
    if (approverId === userId) throw new ApiError(400, "invalid_request", "Ask someone else to approve");
    const approver = await WorkspaceMembership.findOne({ workspaceId: task.workspaceId, userId: oid(approverId) }).select("role").lean();
    if (!approver || approver.role === "viewer") throw new ApiError(400, "invalid_request", "The approver must be a member who can edit tasks");
    if (task.status === "done" || task.status === "canceled") throw new ApiError(409, "conflict", "This task is already closed");
    task.set("approval", { status: "pending", requestedById: oid(userId), approverId: oid(approverId), requestedAt: new Date(), decidedAt: null, note: null });
    await task.save();
    await activity(task, userId, "approval.requested", { approverId });
    await notify({ workspaceId: task.workspaceId, taskId: task._id, actorId: userId, kind: "approval_requested", recipientIds: [approverId] });
    return mapApproval(task.approval);
  });
}

/** The approver approves, or rejects with an optional note on what to change. */
export function decideApproval(userId: string, taskId: string, decision: "approve" | "reject", note: string | null) {
  return withDb(async () => {
    const { task, role } = await load(userId, taskId);
    const current = mapApproval(task.approval);
    if (!approvalActions(current, userId, role).decide || !current) {
      throw new ApiError(403, "forbidden", "Only the approver can decide a pending approval");
    }
    const status = decision === "approve" ? "approved" : "rejected";
    task.set("approval", { ...task.toObject().approval, status, decidedAt: new Date(), note: note?.trim() || null });
    await task.save();
    await activity(task, userId, `approval.${status}`, note?.trim() ? { note: note.trim() } : {});
    await notify({
      workspaceId: task.workspaceId, taskId: task._id, actorId: userId,
      kind: status === "approved" ? "approval_approved" : "approval_rejected",
      recipientIds: [current.requestedById],
    });
    return mapApproval(task.approval);
  });
}

/** Clears the approval: the requester or an admin. */
export function withdrawApproval(userId: string, taskId: string) {
  return withDb(async () => {
    const { task, role } = await load(userId, taskId);
    if (!approvalActions(mapApproval(task.approval), userId, role).withdraw) {
      throw new ApiError(403, "forbidden", "Only the requester or an admin can withdraw it");
    }
    task.set("approval", null);
    await task.save();
    await activity(task, userId, "approval.withdrawn", {});
    return null;
  });
}
