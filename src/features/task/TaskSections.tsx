"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import type { Task } from "@/src/core/sync/types";
import { useCan } from "@/src/features/workspace/WorkspaceRoleContext";
import { PriorityBadge } from "@/src/features/task/priority";
import { TaskDrawer } from "@/src/features/task/TaskDrawer";
import { TaskTagChips } from "@/src/features/tags/tags";
import { TaskBlockedBadge, TaskDeadlineBadge, TaskDueBadge, TaskDurationBadge, TaskRepeatBadge, TaskSubtaskBadge } from "@/src/features/task/TaskDueBadge";
import { seedTaskCache } from "@/src/features/task/task-cache";

export type TaskSection = { key: string; label: string; tasks: Task[]; tone?: "alert" };

/**
 * Open tasks from any project, in labelled sections: tick to complete, click
 * to open the drawer (?task= deep links too). Used by Today, Upcoming and
 * saved filters. `queryKey` is the list query the tasks came from, so a
 * completed task leaves it at once.
 */
export function TaskSections({ workspaceId, sections, queryKey, actions }: {
  workspaceId: string;
  sections: TaskSection[];
  queryKey: readonly unknown[];
  /** Extra controls at the end of each row. */
  actions?: (task: Task) => ReactNode;
}) {
  const queryClient = useQueryClient();
  const canWrite = useCan("task.write");
  const workspaceQuery = useQuery({
    queryKey: qk.workspace(workspaceId),
    queryFn: () => api.getWorkspace(workspaceId),
    staleTime: 60_000,
  });
  const projectName = new Map((workspaceQuery.data?.projects ?? []).map((project) => [project.id, project.name]));
  const tasks = sections.flatMap((section) => section.tasks);

  const urlTaskId = useSearchParams().get("task");
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(urlTaskId);
  const [seenUrlTaskId, setSeenUrlTaskId] = useState(urlTaskId);
  if (urlTaskId !== seenUrlTaskId) {
    setSeenUrlTaskId(urlTaskId);
    setDrawerTaskId(urlTaskId);
  }
  function writeTaskParam(taskId: string | null) {
    const url = new URL(window.location.href);
    if (taskId) url.searchParams.set("task", taskId);
    else url.searchParams.delete("task");
    window.history.pushState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  const [error, setError] = useState<string | null>(null);
  const complete = useMutation({
    mutationFn: (taskId: string) => api.updateTask(taskId, { status: "done" }),
    onMutate: async (taskId) => {
      setError(null);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<{ tasks: Task[] }>(queryKey);
      queryClient.setQueryData<{ tasks: Task[] }>(queryKey, (old) =>
        old ? { tasks: old.tasks.filter((task) => task.id !== taskId) } : old);
      return { previous };
    },
    onError: (err: Error, _taskId, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      setError(err.message);
    },
    // A repeating task's next copy may land in this list; goal progress moves too.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["goals", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["goal"] });
    },
  });

  return (
    <>
      {error ? <p role="alert" className="text-sm text-[var(--accent)]">{error}</p> : null}
      {sections.map((section) => (
        <div key={section.key} aria-labelledby={`section-${section.key}`} role="group">
          <h2 id={`section-${section.key}`} className={`mb-2 font-mono text-[11px] uppercase tracking-[0.16em] ${section.tone === "alert" ? "text-[var(--accent)]" : "text-[var(--muted-foreground)]"}`}>
            {section.label} <span className="text-[var(--muted-foreground)]">· {section.tasks.length}</span>
          </h2>
          <ul className="divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
            {section.tasks.map((task) => (
              <li key={task.id} data-task-row={task.title} className="flex items-start gap-3 py-2.5">
                <button
                  type="button"
                  aria-label={`Complete ${task.title}`}
                  disabled={!canWrite || complete.isPending}
                  onClick={() => complete.mutate(task.id)}
                  className="group mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-[var(--hairline)] hover:border-[var(--accent)] disabled:opacity-50"
                >
                  <Check size={12} aria-hidden className="opacity-0 group-hover:opacity-100" />
                </button>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      seedTaskCache(queryClient, task);
                      setDrawerTaskId(task.id);
                      writeTaskParam(task.id);
                    }}
                    className="block max-w-full truncate text-left text-sm text-[var(--foreground)] hover:underline"
                  >
                    {task.title}
                  </button>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <PriorityBadge priority={task.priority} />
                    <TaskBlockedBadge blocked={task.blocked} />
                    <TaskDueBadge dueAt={task.dueAt} hasTime={task.dueHasTime} />
                    <TaskDeadlineBadge deadlineAt={task.deadlineAt} />
                    <TaskDurationBadge minutes={task.durationMinutes} />
                    <TaskRepeatBadge rule={task.recurrence} />
                    <TaskSubtaskBadge count={task.subtaskCount} />
                    <TaskTagChips workspaceId={task.workspaceId} tagIds={task.tagIds} />
                    <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
                      {task.projectId ? projectName.get(task.projectId) ?? "Project" : "Inbox"}
                    </span>
                  </div>
                </div>
                {actions ? <div className="flex shrink-0 flex-wrap justify-end gap-1">{actions(task)}</div> : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {drawerTaskId ? (
        <TaskDrawer
          key={drawerTaskId}
          workspaceId={workspaceId}
          taskId={drawerTaskId}
          initialTask={tasks.find((task) => task.id === drawerTaskId)}
          onClose={() => {
            setDrawerTaskId(null);
            writeTaskParam(null);
            void queryClient.invalidateQueries({ queryKey: ["tasks", workspaceId] });
          }}
        />
      ) : null}
    </>
  );
}
