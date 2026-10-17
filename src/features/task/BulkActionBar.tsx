"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import type { Task } from "@/src/core/sync/types";
import type { TaskPriority, TaskStatus } from "@/src/core/models/enums";
import { dateInputToIso } from "@/src/features/task/dates";

const fieldClass = "h-9 rounded-lg border border-[var(--hairline)] bg-[var(--bg)] px-2 text-sm text-[var(--foreground)] disabled:opacity-50";

type Patch = Partial<Pick<Task, "status" | "priority" | "dueAt" | "dueHasTime" | "projectId">>;

/**
 * Shown while tasks are selected in the list view: set status, priority, due
 * date or project on all of them, or delete them. Each change is one request
 * for the whole selection; tasks that couldn't change are named afterwards.
 */
export function BulkActionBar({ workspaceId, selectedIds, visibleIds, onSelectAll, onClear, onExit }: {
  workspaceId: string;
  selectedIds: string[];
  visibleIds: string[];
  onSelectAll: () => void;
  onClear: () => void;
  onExit: () => void;
}) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const workspace = useQuery({ queryKey: qk.workspace(workspaceId), queryFn: () => api.getWorkspace(workspaceId), staleTime: 60_000 });
  const projects = (workspace.data?.projects ?? []).filter((project) => !project.archivedAt);

  const run = useMutation({
    mutationFn: (body: { patch?: Patch; delete?: true }) => api.bulkTasks(workspaceId, { taskIds: selectedIds, ...body }),
    onMutate: () => setMessage(null),
    onSuccess: (result, body) => {
      const done = body.delete ? selectedIds.length - result.failed.length : result.tasks.length;
      setMessage(result.failed.length
        ? `${done} changed; ${result.failed.length} couldn't be: ${result.failed[0]!.message}`
        : `${done} task${done === 1 ? "" : "s"} ${body.delete ? "deleted" : "updated"}.`);
      if (!result.failed.length) onClear();
    },
    onError: (err: Error) => setMessage(err.message),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["tasks", workspaceId] }),
  });

  const count = selectedIds.length;
  const allSelected = count > 0 && visibleIds.every((id) => selectedIds.includes(id));

  return (
    <div role="region" aria-label="Bulk edit" className="flex flex-wrap items-center gap-2 rounded-[var(--r-lg)] border border-[var(--accent)] bg-[var(--surface)] p-3">
      <span className="text-sm font-medium text-[var(--foreground)]">{count} selected</span>
      <button type="button" onClick={allSelected ? onClear : onSelectAll} className="text-xs text-[var(--muted-foreground)] underline-offset-2 hover:underline">
        {allSelected ? "Select none" : `Select all ${visibleIds.length}`}
      </button>
      <select aria-label="Set status" value="" disabled={!count || run.isPending} className={fieldClass}
        onChange={(event) => event.target.value && run.mutate({ patch: { status: event.target.value as TaskStatus } })}>
        <option value="">Status…</option>
        <option value="todo">Todo</option>
        <option value="in_progress">In progress</option>
        <option value="done">Done</option>
        <option value="canceled">Canceled</option>
      </select>
      <select aria-label="Set priority" value="" disabled={!count || run.isPending} className={fieldClass}
        onChange={(event) => event.target.value && run.mutate({ patch: { priority: event.target.value as TaskPriority } })}>
        <option value="">Priority…</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
        <option value="none">None</option>
      </select>
      <label className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
        Due
        <input type="date" aria-label="Set due date" disabled={!count || run.isPending} className={fieldClass}
          onChange={(event) => event.target.value && run.mutate({ patch: { dueAt: dateInputToIso(event.target.value), dueHasTime: false } })} />
      </label>
      <button type="button" disabled={!count || run.isPending} onClick={() => run.mutate({ patch: { dueAt: null } })}
        className="h-9 rounded-lg border border-[var(--hairline)] px-2 text-xs disabled:opacity-50">
        Clear due
      </button>
      <select aria-label="Move to project" value="" disabled={!count || run.isPending} className={fieldClass}
        onChange={(event) => event.target.value && run.mutate({ patch: { projectId: event.target.value === "inbox" ? null : event.target.value } })}>
        <option value="">Move to…</option>
        <option value="inbox">Inbox</option>
        {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select>
      <button type="button" disabled={!count || run.isPending}
        onClick={() => { if (window.confirm(`Delete ${count} task${count === 1 ? "" : "s"}? They go to the Trash.`)) run.mutate({ delete: true }); }}
        className="h-9 rounded-lg border border-[var(--hairline)] px-2 text-xs text-red-600 disabled:opacity-50 dark:text-red-400">
        Delete
      </button>
      <button type="button" onClick={onExit} className="ml-auto text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
        Done
      </button>
      {run.isPending ? <p role="status" className="w-full text-xs text-[var(--muted-foreground)]">Saving…</p> : null}
      {message ? <p role="status" className="w-full text-xs text-[var(--muted-foreground)]">{message}</p> : null}
    </div>
  );
}
