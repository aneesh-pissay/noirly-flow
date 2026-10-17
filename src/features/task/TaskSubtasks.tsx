"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import type { Task } from "@/src/core/sync/types";

/** Levels below a top-level task, matching the server's limit (four levels in all). */
const MAX_DEPTH = 3;

/** Opens another task in the drawer: the list and agenda views follow ?task=. */
export function openTaskInDrawer(taskId: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("task", taskId);
  window.history.pushState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

/** The chain of parents above a task, top first. Loads them one by one from the task cache. */
function useAncestors(task: Task | undefined) {
  const parent = useQuery({
    queryKey: task?.parentTaskId ? qk.task(task.parentTaskId) : ["task", "none"],
    queryFn: () => api.getTask(task!.parentTaskId!),
    enabled: Boolean(task?.parentTaskId),
  });
  const grandparentId = parent.data?.task.parentTaskId ?? null;
  const grandparent = useQuery({
    queryKey: grandparentId ? qk.task(grandparentId) : ["task", "none"],
    queryFn: () => api.getTask(grandparentId!),
    enabled: Boolean(grandparentId),
  });
  const greatId = grandparent.data?.task.parentTaskId ?? null;
  const great = useQuery({
    queryKey: greatId ? qk.task(greatId) : ["task", "none"],
    queryFn: () => api.getTask(greatId!),
    enabled: Boolean(greatId),
  });
  return [great.data?.task, grandparent.data?.task, parent.data?.task].filter((t): t is Task => Boolean(t));
}

/** "Parent › Child ›" above a subtask's fields; each step opens that task. */
export function SubtaskBreadcrumb({ task }: { task: Task | undefined }) {
  const ancestors = useAncestors(task);
  if (!task?.parentTaskId) return null;
  return (
    <nav aria-label="Parent tasks" className="flex flex-wrap items-center gap-1 text-xs text-[var(--muted-foreground)]">
      {ancestors.map((ancestor) => (
        <span key={ancestor.id} className="inline-flex items-center gap-1">
          <button type="button" onClick={() => openTaskInDrawer(ancestor.id)} className="max-w-[12rem] truncate hover:text-[var(--foreground)] hover:underline">
            {ancestor.title}
          </button>
          <ChevronRight size={12} aria-hidden />
        </span>
      ))}
      {!ancestors.length ? <span>Subtask</span> : null}
    </nav>
  );
}

/**
 * The task's own subtasks: tick to finish, click to open (with their own
 * subtasks), and add new ones while the nesting limit allows.
 */
export function TaskSubtasks({ workspaceId, task, canWrite }: { workspaceId: string; task: Task; canWrite: boolean }) {
  const queryClient = useQueryClient();
  const depth = useAncestors(task).length;
  const queryKey = qk.tasks(workspaceId, { parentTaskId: task.id });
  const subtasks = useQuery({ queryKey, queryFn: () => api.listTasks(workspaceId, { parentTaskId: task.id }) });
  const [title, setTitle] = useState("");
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["tasks", workspaceId] });

  const create = useMutation({
    mutationFn: () => api.createTask(workspaceId, { title: title.trim(), parentTaskId: task.id, projectId: task.projectId }),
    onSuccess: () => { setTitle(""); refresh(); },
  });
  const toggle = useMutation({
    mutationFn: (subtask: Task) => api.updateTask(subtask.id, { status: subtask.status === "done" ? "todo" : "done" }),
    onMutate: async (subtask) => {
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData<{ tasks: Task[] }>(queryKey, (old) => old ? {
        tasks: old.tasks.map((t) => (t.id === subtask.id ? { ...t, status: subtask.status === "done" ? "todo" : "done" } : t)),
      } : old);
    },
    onSettled: refresh,
  });

  const list = (subtasks.data?.tasks ?? []).filter((t) => t.status !== "canceled");
  const done = list.filter((t) => t.status === "done").length;
  const canNest = depth < MAX_DEPTH;

  return (
    <section aria-label="Subtasks">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
        Subtasks{list.length ? ` · ${done}/${list.length}` : ""}
      </p>
      {subtasks.isPending ? <p className="text-xs text-[var(--muted-foreground)]">Loading…</p> : null}
      <ul className="space-y-1">
        {list.map((subtask) => (
          <li key={subtask.id} className="flex items-center gap-2">
            <input type="checkbox" checked={subtask.status === "done"} disabled={!canWrite}
              aria-label={`${subtask.status === "done" ? "Reopen" : "Complete"} ${subtask.title}`}
              onChange={() => toggle.mutate(subtask)} className="size-4 shrink-0" />
            <button type="button" onClick={() => openTaskInDrawer(subtask.id)}
              className={`min-w-0 flex-1 truncate text-left text-sm hover:underline ${subtask.status === "done" ? "text-[var(--muted-foreground)] line-through" : "text-[var(--foreground)]"}`}>
              {subtask.title}
            </button>
            {subtask.subtaskCount ? (
              <span className="shrink-0 font-mono text-[11px] text-[var(--muted-foreground)]">{subtask.subtaskCount.done}/{subtask.subtaskCount.total}</span>
            ) : null}
          </li>
        ))}
      </ul>
      {canWrite && canNest ? (
        <form className="mt-2 flex gap-2" onSubmit={(event) => { event.preventDefault(); if (title.trim()) create.mutate(); }}>
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={500} placeholder="Add subtask" aria-label="Add subtask"
            className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--hairline)] bg-[var(--surface)] px-2 text-sm text-[var(--foreground)]" />
          <button type="submit" disabled={!title.trim() || create.isPending} className="h-9 rounded-lg border border-[var(--hairline)] px-3 text-sm disabled:opacity-50">
            {create.isPending ? "Adding…" : "Add"}
          </button>
        </form>
      ) : canWrite ? (
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">Subtasks can go four levels deep.</p>
      ) : null}
      {create.isError ? <p role="alert" className="mt-1 text-xs text-[var(--accent)]">{(create.error as Error).message}</p> : null}
    </section>
  );
}
