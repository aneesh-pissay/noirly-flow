export type ApprovalStatus = "pending" | "approved" | "rejected";

/** The sign-off a task is waiting on, or got. One per task; requesting again replaces it. */
export type Approval = {
  status: ApprovalStatus;
  requestedById: string;
  approverId: string;
  requestedAt: string;
  decidedAt: string | null;
  /** The approver's note, usually what to change. */
  note: string | null;
};

type Role = "viewer" | "member" | "admin" | "owner";

/** What `meId` can do with a task's approval. */
export function approvalActions(approval: Approval | null, meId: string, role: Role) {
  const writer = role !== "viewer";
  const admin = role === "admin" || role === "owner";
  if (!approval) return { request: writer, decide: false, withdraw: false };
  return {
    // Ask again after changes were requested, or of someone else.
    request: writer && approval.status !== "pending",
    decide: approval.status === "pending" && approval.approverId === meId,
    withdraw: writer && (approval.requestedById === meId || admin),
  };
}

/** A task with an approval that isn't approved can't be finished. */
export function blocksCompletion(approval: Approval | null | undefined) {
  return Boolean(approval && approval.status !== "approved");
}
