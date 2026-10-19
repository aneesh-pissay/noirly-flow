"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, CircleDashed, CircleAlert } from "lucide-react";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import type { Task } from "@/src/core/sync/types";
import { approvalActions, type Approval } from "@/src/core/approvals";
import { memberName, type WorkspaceMember } from "@/src/features/workspace/members";
import { useWorkspaceRole } from "@/src/features/workspace/WorkspaceRoleContext";
import { patchCachedTask } from "@/src/features/task/task-cache";

const smallButton = "rounded-[var(--r-sm)] border border-[var(--hairline)] px-2.5 py-1 text-xs text-[var(--foreground)] hover:border-[var(--accent)] disabled:opacity-50";
const fieldClass = "h-9 w-full border border-[var(--hairline)] bg-[var(--surface)] px-2 text-sm text-[var(--foreground)]";

/** A row chip for a task's approval state. */
export function ApprovalBadge({ approval }: { approval: Approval | null | undefined }) {
  if (!approval) return null;
  const [Icon, label, tone] = approval.status === "pending"
    ? [CircleDashed, "Awaiting approval", "text-[var(--muted-foreground)]"]
    : approval.status === "approved"
      ? [BadgeCheck, "Approved", "text-[var(--muted-foreground)]"]
      : [CircleAlert, "Changes requested", "text-[var(--accent)]"];
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wide ${tone}`}>
      <Icon size={11} aria-hidden />{label}
    </span>
  );
}

/** Drawer section: request, decide, or withdraw the task's approval. */
export function ApprovalPanel({ workspaceId, task, members, meId }: {
  workspaceId: string;
  task: Task;
  members: Array<WorkspaceMember & { role?: string }>;
  meId: string | undefined;
}) {
  const queryClient = useQueryClient();
  const role = useWorkspaceRole();
  const approval = task.approval ?? null;
  const actions = meId ? approvalActions(approval, meId, role) : { request: false, decide: false, withdraw: false };
  const [approverId, setApproverId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const change = useMutation({
    mutationFn: (run: () => Promise<{ approval: Approval | null }>) => run(),
    onMutate: () => setError(null),
    onSuccess: (result) => {
      patchCachedTask(queryClient, workspaceId, task.id, { approval: result.approval });
      void queryClient.invalidateQueries({ queryKey: qk.task(task.id) });
      void queryClient.invalidateQueries({ queryKey: ["tasks", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: qk.activity(workspaceId, task.id) });
      setNote("");
    },
    onError: (err: Error) => setError(err.message),
  });
  // Viewers can't edit tasks, so they can't sign off either.
  const approvers = members.filter((member) => member.userId !== meId && member.role !== "viewer");
  const name = (userId: string) => memberName(members, userId);
  const closed = task.status === "done" || task.status === "canceled";

  function submitRequest(event: FormEvent) {
    event.preventDefault();
    if (approverId) change.mutate(() => api.requestApproval(task.id, approverId));
  }

  if (!approval && (closed || !actions.request)) return null;
  return (
    <section aria-labelledby="approval-title" className="space-y-2">
      <p id="approval-title" className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Approval</p>
      {error ? <p role="alert" className="text-sm text-[var(--accent)]">{error}</p> : null}
      {approval ? (
        <div className="space-y-2 text-sm">
          <ApprovalBadge approval={approval} />
          <p className="text-[var(--foreground)]">
            {approval.status === "pending"
              ? `Waiting on ${name(approval.approverId)}, asked by ${name(approval.requestedById)}.`
              : approval.status === "approved"
                ? `Approved by ${name(approval.approverId)}.`
                : `${name(approval.approverId)} requested changes.`}
          </p>
          {approval.note ? <p className="border-l-2 border-[var(--hairline)] pl-2 text-[var(--muted-foreground)]">{approval.note}</p> : null}
          {actions.decide ? (
            <div className="space-y-2">
              <label className="block space-y-1 text-xs text-[var(--muted-foreground)]">
                <span>Note (optional)</span>
                <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={2}
                  className="w-full border border-[var(--hairline)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--foreground)]" />
              </label>
              <div className="flex gap-2">
                <button type="button" className={smallButton} disabled={change.isPending}
                  onClick={() => change.mutate(() => api.decideApproval(task.id, "approve", note))}>Approve</button>
                <button type="button" className={smallButton} disabled={change.isPending}
                  onClick={() => change.mutate(() => api.decideApproval(task.id, "reject", note))}>Request changes</button>
              </div>
            </div>
          ) : null}
          {actions.withdraw ? (
            <button type="button" disabled={change.isPending} onClick={() => change.mutate(() => api.withdrawApproval(task.id))}
              className="text-xs text-[var(--muted-foreground)] underline-offset-2 hover:text-[var(--foreground)] hover:underline disabled:opacity-50">
              {approval.status === "pending" ? "Withdraw request" : "Clear approval"}
            </button>
          ) : null}
        </div>
      ) : null}
      {actions.request && !closed ? (
        <form onSubmit={submitRequest} className="flex items-end gap-2">
          <label className="flex-1 space-y-1 text-xs text-[var(--muted-foreground)]">
            <span>{approval ? "Ask again" : "Ask someone to approve"}</span>
            <select aria-label="Approver" value={approverId} onChange={(event) => setApproverId(event.target.value)} className={fieldClass}>
              <option value="">Choose a person</option>
              {approvers.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}
            </select>
          </label>
          <button type="submit" className={`h-9 ${smallButton}`} disabled={!approverId || change.isPending}>Request approval</button>
        </form>
      ) : null}
    </section>
  );
}
