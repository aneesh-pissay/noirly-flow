"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import type { Task } from "@/src/core/sync/types";
import { useCan } from "@/src/features/workspace/WorkspaceRoleContext";
import { agendaRange, agendaSections, UPCOMING_DAYS, type AgendaMode } from "@/src/features/task/agenda";
import { PriorityBadge } from "@/src/features/task/priority";
import { TaskDrawer } from "@/src/features/task/TaskDrawer";
import { TaskDeadlineBadge, TaskDueBadge, TaskDurationBadge, TaskRepeatBadge } from "@/src/features/task/TaskDueBadge";
import { seedTaskCache } from "@/src/features/task/task-cache";

const OPEN = "todo,in_progress";

/**
 * Today (overdue plus due today) or Upcoming (the next two weeks), across
 * every project in the workspace and its Inbox. Open tasks only; ticking one
 * marks it done.
 */
export function AgendaView({ workspaceId, mode }: { workspaceId: string; mode: AgendaMode }) {
  const queryClient = useQueryClient();
  const canWrite = useCan("task.write");
  // The range is fixed per mount; it moves on at midnight when the page is next opened or refreshed.
  const [range] = useState(() => agendaRange(mode));
  const filters = { view: mode, status: OPEN, ...range };
  const tasksQuery = useQuery({
    queryKey: qk.tasks(workspaceId, filters),
    queryFn: () => api.listTasks(workspaceId, { status: OPEN, ...range }),
    refetchInterval: 60_000,
  });
  const workspaceQuery = useQuery({
    queryKey: qk.workspace(workspaceId),
    queryFn: () => api.getWorkspace(workspaceId),
    staleTime: 60_000,
  });
  const projectName = new Map((workspaceQuery.data?.projects ?? []).map((project) => [project.id, project.name]));

  // ?task= opens the drawer, as on project pages, so links and Cmd+K land here too.
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
      await queryClient.cancelQueries({ queryKey: qk.tasks(workspaceId, filters) });
      const previous = queryClient.getQueryData<{ tasks: Task[] }>(qk.tasks(workspaceId, filters));
      queryClient.setQueryData<{ tasks: Task[] }>(qk.tasks(workspaceId, filters), (old) =>
        old ? { tasks: old.tasks.filter((task) => task.id !== taskId) } : old);
      return { previous };
    },
    onError: (err: Error, _taskId, context) => {
      if (context?.previous) queryClient.setQueryData(qk.tasks(workspaceId, filters), context.previous);
      setError(err.message);
    },
    // A repeating task's next copy may land in this view.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["tasks", workspaceId] }),
  });

  const tasks = tasksQuery.data?.tasks ?? [];
  const sections = agendaSections(mode, tasks);
  const heading = mode === "today" ? "Today" : "Upcoming";
  const subtitle = mode === "today"
    ? new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date())
    : `The next ${UPCOMING_DAYS} days`;

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">{heading}</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          {subtitle}{tasksQuery.data ? ` · ${tasks.length} open` : ""}
        </p>
      </header>
      {error ? <p role="alert" className="text-sm text-[var(--accent)]">{error}</p> : null}
      {tasksQuery.isPending ? <p className="text-sm text-[var(--muted-foreground)]">Loading tasks…</p> : null}
      {tasksQuery.isError ? <p role="alert" className="text-sm">Could not load tasks. <button type="button" className="underline" onClick={() => void tasksQuery.refetch()}>Retry</button></p> : null}
      {tasksQuery.data && !sections.length ? (
        <p className="rounded-xl border border-dashed border-[var(--hairline)] p-6 text-center text-sm text-[var(--muted-foreground)]">
          {mode === "today" ? "Nothing due today. Enjoy it." : "Nothing due in the next two weeks."}
        </p>
      ) : null}
      {sections.map((section) => (
        <div key={section.key} aria-labelledby={`agenda-${section.key}`} role="group">
          <h2 id={`agenda-${section.key}`} className={`mb-2 font-mono text-[11px] uppercase tracking-[0.16em] ${section.key === "overdue" ? "text-[var(--accent)]" : "text-[var(--muted-foreground)]"}`}>
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
                    <TaskDueBadge dueAt={task.dueAt} hasTime={task.dueHasTime} />
                    <TaskDeadlineBadge deadlineAt={task.deadlineAt} />
                    <TaskDurationBadge minutes={task.durationMinutes} />
                    <TaskRepeatBadge rule={task.recurrence} />
                    <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
                      {task.projectId ? projectName.get(task.projectId) ?? "Project" : "Inbox"}
                    </span>
                  </div>
                </div>
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
    </section>
  );
}
