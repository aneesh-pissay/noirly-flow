"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RealtimeClientContext } from "@noirly-dev/realtime-client/react";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { qk } from "@/src/core/sync/query-keys";
import { api } from "@/src/lib/api-client";
import type { Tag, Task } from "@/src/core/sync/types";
import type { TaskPriority, TaskStatus } from "@/src/core/models/enums";
import { TaskBoard } from "@/src/features/task/TaskBoard";
import { TaskCalendar } from "@/src/features/task/TaskCalendar";
import { TaskDueBadge } from "@/src/features/task/TaskDueBadge";
import { AssigneeChips } from "@/src/features/task/AssigneeChips";
import { TagChips, TaskDrawer } from "@/src/features/task/TaskDrawer";
import { ProjectRealtime } from "@/src/features/realtime/ProjectRealtime";
import type { WorkspaceMember } from "@/src/features/workspace/members";
import { useCan } from "@/src/features/workspace/WorkspaceRoleContext";
import {
  dateInputToIso,
  isoToDateInput,
  type DuePreset,
} from "@/src/features/task/dates";
import {
  patchCachedTask,
  removeCachedTask,
  restoreTaskQueries,
  seedTaskCache,
  snapshotTaskQueries,
  upsertCachedTask,
} from "@/src/features/task/task-cache";

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "Todo" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
  { value: "canceled", label: "Canceled" },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "none", label: "None" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const DUE_FILTERS: { value: DuePreset | ""; label: string }[] = [
  { value: "", label: "Any due date" },
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "none", label: "No date" },
];

const fieldClass =
  "box-border h-10 min-h-10 shrink-0 rounded-xl border border-[var(--hairline)] bg-[var(--bg)] px-3 text-sm leading-none text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

const actionClass =
  "inline-flex h-10 min-h-10 shrink-0 items-center justify-center rounded-xl px-3 text-sm leading-none transition-colors";

type Props = {
  workspaceId: string;
  projectId: string | null;
  projectName: string;
};

export function TaskWorkspace({ workspaceId, projectId, projectName }: Props) {
  const queryClient = useQueryClient();
  // useSearchParams follows router.push (command palette), pushState
  // (writeTaskParam) and back/forward, so a changed ?task= opens the drawer.
  const urlTaskId = useSearchParams().get("task");
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(urlTaskId);
  const [seenUrlTaskId, setSeenUrlTaskId] = useState(urlTaskId);
  if (urlTaskId !== seenUrlTaskId) {
    setSeenUrlTaskId(urlTaskId);
    setDrawerTaskId(urlTaskId);
  }
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("none");
  const [dueDate, setDueDate] = useState("");
  const [view, setView] = useState<"list" | "board" | "calendar">(
    projectId ? "board" : "list",
  );
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "">("");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "">("");
  const [dueFilter, setDueFilter] = useState<DuePreset | "">("");
  const [assignedToMe, setAssignedToMe] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const canWrite = useCan("task.write");
  const isInbox = !projectId;

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => api.me(),
  });

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const inField =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      if (inField || event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (event.key === "1") {
        event.preventDefault();
        setView("list");
        return;
      }
      if (event.key === "2" && projectId) {
        event.preventDefault();
        setView("board");
        return;
      }
      if (event.key === "3") {
        event.preventDefault();
        setView("calendar");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [projectId]);

  const filters = useMemo(
    () => ({
      projectId: projectId ?? undefined,
      inbox: isInbox ? "1" : undefined,
      root: "1",
      assigneeId:
        assignedToMe && meQuery.data?.user.id
          ? meQuery.data.user.id
          : undefined,
      status: statusFilter || undefined,
      priority: priorityFilter || undefined,
      search: search || undefined,
      due: dueFilter || undefined,
    }),
    [
      projectId,
      isInbox,
      assignedToMe,
      meQuery.data?.user.id,
      statusFilter,
      priorityFilter,
      search,
      dueFilter,
    ],
  );

  const hasActiveFilters = Boolean(
    search || statusFilter || priorityFilter || dueFilter || assignedToMe,
  );

  const refetchInterval = useTaskRefetchInterval();

  const tasksQuery = useQuery({
    queryKey: qk.tasks(workspaceId, filters),
    queryFn: () => api.listTasks(workspaceId, filters),
    refetchInterval,
    refetchIntervalInBackground: false,
  });

  const projectQuery = useQuery({
    queryKey: projectId ? qk.project(projectId) : ["project", "none"],
    queryFn: () => api.getProject(projectId!),
    enabled: Boolean(projectId),
  });

  const tagsQuery = useQuery({
    queryKey: ["tags", workspaceId],
    queryFn: () => api.listTags(workspaceId),
  });

  const membersQuery = useQuery({
    queryKey: qk.members(workspaceId),
    queryFn: () => api.listMembers(workspaceId),
  });

  function writeTaskParam(taskId: string | null) {
    const url = new URL(window.location.href);
    if (taskId) url.searchParams.set("task", taskId);
    else url.searchParams.delete("task");
    const next = `${url.pathname}${url.search}${url.hash}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` === next) {
      return;
    }
    window.history.pushState(window.history.state, "", next);
  }

  function openTask(taskId: string) {
    if (taskId.startsWith("tmp-")) return;
    const task = tasksQuery.data?.tasks.find((item) => item.id === taskId);
    if (task) seedTaskCache(queryClient, task);
    setDrawerTaskId(taskId);
    writeTaskParam(taskId);
  }

  function closeTask() {
    setDrawerTaskId(null);
    writeTaskParam(null);
  }

  const createMutation = useMutation({
    mutationFn: (input: {
      title: string;
      priority: TaskPriority;
      dueAt: string | null;
    }) =>
      api.createTask(workspaceId, {
        title: input.title,
        projectId,
        priority: input.priority,
        dueAt: input.dueAt,
      }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ["tasks", workspaceId] });
      const previous = queryClient.getQueriesData<{ tasks: Task[] }>({
        queryKey: ["tasks", workspaceId],
      });
      const now = new Date().toISOString();
      const optimistic: Task = {
        id: `tmp-${crypto.randomUUID()}`,
        workspaceId,
        projectId,
        columnId: null,
        title: input.title,
        description: null,
        status: "todo",
        priority: input.priority,
        dueAt: input.dueAt,
        startAt: null,
        completedAt: null,
        position: Date.now(),
        assigneeIds: [],
        tagIds: [],
        parentTaskId: null,
        recurrence: null,
        checklist: [],
        createdById: meQuery.data?.user.id ?? "",
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      queryClient.setQueriesData<{ tasks: Task[] }>(
        { queryKey: ["tasks", workspaceId] },
        (old) => (old ? { tasks: [optimistic, ...old.tasks] } : old),
      );
      setTitle("");
      setPriority("none");
      setDueDate("");
      setError(null);
      return { previous, optimisticId: optimistic.id };
    },
    onSuccess: (data, _input, context) => {
      queryClient.setQueriesData<{ tasks: Task[] }>(
        { queryKey: ["tasks", workspaceId] },
        (old) => {
          if (!old) return old;
          return {
            tasks: old.tasks.map((task) =>
              task.id === context?.optimisticId ? data.task : task,
            ),
          };
        },
      );
    },
    onError: (err: Error, _input, context) => {
      for (const [key, data] of context?.previous ?? []) {
        queryClient.setQueryData(key, data);
      }
      setError(err.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      taskId,
      patch,
    }: {
      taskId: string;
      patch: Partial<Task>;
    }) => api.updateTask(taskId, patch),
    onMutate: async ({ taskId, patch }) => {
      await queryClient.cancelQueries({ queryKey: ["tasks", workspaceId] });
      const previous = snapshotTaskQueries(queryClient, workspaceId);
      patchCachedTask(queryClient, workspaceId, taskId, patch);
      setError(null);
      return { previous };
    },
    onSuccess: (data) => {
      upsertCachedTask(queryClient, workspaceId, data.task);
    },
    onError: (err: Error, _vars, context) => {
      if (context?.previous) {
        restoreTaskQueries(queryClient, context.previous);
      }
      setError(err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (taskId: string) => api.deleteTask(taskId),
    onMutate: async (taskId) => {
      await queryClient.cancelQueries({ queryKey: ["tasks", workspaceId] });
      const previous = snapshotTaskQueries(queryClient, workspaceId);
      if (drawerTaskId === taskId) {
        setDrawerTaskId(null);
        writeTaskParam(null);
      }
      removeCachedTask(queryClient, workspaceId, taskId);
      setError(null);
      return { previous };
    },
    onError: (err: Error, _taskId, context) => {
      if (context?.previous) {
        restoreTaskQueries(queryClient, context.previous);
      }
      setError(err.message);
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (moves: Array<{
      taskId: string;
      columnId: string | null;
      position: number;
      status?: TaskStatus;
    }>) => {
      if (!projectId) {
        throw new Error("Project is required to reorder");
      }
      return api.reorderTasks(projectId, moves);
    },
    onMutate: async (moves) => {
      await queryClient.cancelQueries({ queryKey: qk.tasks(workspaceId, filters) });
      const previous = queryClient.getQueryData<{ tasks: Task[] }>(
        qk.tasks(workspaceId, filters),
      );
      if (previous) {
        const byId = new Map(moves.map((move) => [move.taskId, move]));
        queryClient.setQueryData<{ tasks: Task[] }>(
          qk.tasks(workspaceId, filters),
          {
            tasks: previous.tasks.map((task) => {
              const move = byId.get(task.id);
              if (!move) return task;
              return {
                ...task,
                columnId: move.columnId,
                position: move.position,
                status: move.status ?? task.status,
                completedAt:
                  move.status === "done"
                    ? task.completedAt ?? new Date().toISOString()
                    : move.status
                      ? null
                      : task.completedAt,
              };
            }),
          },
        );
      }
      return { previous };
    },
    onSuccess: (data) => {
      queryClient.setQueriesData<{ tasks: Task[] }>(
        { queryKey: ["tasks", workspaceId] },
        (old) => {
          if (!old) return old;
          const byId = new Map(data.tasks.map((task) => [task.id, task]));
          return {
            tasks: old.tasks.map((task) => byId.get(task.id) ?? task),
          };
        },
      );
    },
    onError: (err: Error, _moves, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          qk.tasks(workspaceId, filters),
          context.previous,
        );
      }
      setError(err.message);
    },
  });

  const tasks = tasksQuery.data?.tasks ?? [];
  const headerName = projectQuery.data?.project.name ?? projectName;
  const openCount = tasks.filter(
    (t) => t.status !== "done" && t.status !== "canceled",
  ).length;

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--muted-foreground)]">
            {headerName}
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight md:text-4xl">
            Tasks
          </h2>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            {openCount} open · {tasks.length} shown
            {!canWrite ? " · view only" : ""}
          </p>
        </div>
        <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto">
          {projectId && process.env.NEXT_PUBLIC_REALTIME_WS_URL ? (
            <ProjectRealtime workspaceId={workspaceId} projectId={projectId} />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setView("list")}
              className={`rounded-xl px-3 py-2 text-sm transition-colors ${
                view === "list"
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border border-[var(--hairline)] text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
              }`}
            >
              List
            </button>
            {projectId ? (
              <button
                type="button"
                onClick={() => setView("board")}
                className={`rounded-xl px-3 py-2 text-sm transition-colors ${
                  view === "board"
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border border-[var(--hairline)] text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
                }`}
              >
                Board
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setView("calendar")}
              className={`rounded-xl px-3 py-2 text-sm transition-colors ${
                view === "calendar"
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border border-[var(--hairline)] text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
              }`}
            >
              Calendar
            </button>
          </div>
        </div>
      </header>

      {canWrite ? (
      <form
        className="surface grain flex flex-wrap items-center gap-2 rounded-[var(--r-lg)] border border-[var(--hairline)] p-4 shadow-[var(--elev-1)]"
        onSubmit={(event) => {
          event.preventDefault();
          const nextTitle = title.trim();
          if (!nextTitle) return;
          createMutation.mutate({
            title: nextTitle,
            priority,
            dueAt: dateInputToIso(dueDate),
          });
        }}
      >
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Add a task…"
          className={`${fieldClass} min-w-[12rem] flex-1`}
        />
        <select
          value={priority}
          onChange={(event) => setPriority(event.target.value as TaskPriority)}
          className={`${fieldClass} cursor-pointer`}
        >
          {PRIORITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          className={fieldClass}
        />
        <button
          type="submit"
          disabled={!title.trim()}
          className={`${actionClass} bg-[var(--accent)] font-medium text-[var(--accent-ink)] disabled:opacity-50`}
        >
          Add
        </button>
      </form>
      ) : (
        <p className="rounded-[var(--r-lg)] border border-[var(--hairline)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
          You have view-only access. Ask an admin if you need to edit tasks.
        </p>
      )}

      <div className="surface grain flex flex-wrap items-center gap-2 rounded-[var(--r-lg)] border border-[var(--hairline)] p-4 shadow-[var(--elev-1)]">
        <input
          ref={searchInputRef}
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search tasks… (/)"
          className={`${fieldClass} min-w-[12rem] flex-1`}
        />
        <button
          type="button"
          onClick={() => setAssignedToMe((value) => !value)}
          disabled={!meQuery.data?.user.id}
          className={`${actionClass} disabled:opacity-50 ${
            assignedToMe
              ? "bg-[var(--accent-soft)] text-[var(--accent)]"
              : "border border-[var(--hairline)] text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
          }`}
        >
          Assigned to me
        </button>
        <select
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(event.target.value as TaskStatus | "")
          }
          className={`${fieldClass} cursor-pointer`}
        >
          <option value="">Any status</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(event) =>
            setPriorityFilter(event.target.value as TaskPriority | "")
          }
          className={`${fieldClass} cursor-pointer`}
        >
          <option value="">Any priority</option>
          {PRIORITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={dueFilter}
          onChange={(event) =>
            setDueFilter(event.target.value as DuePreset | "")
          }
          className={`${fieldClass} cursor-pointer`}
        >
          {DUE_FILTERS.map((option) => (
            <option key={option.value || "any"} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={() => {
              setSearchInput("");
              setSearch("");
              setStatusFilter("");
              setPriorityFilter("");
              setDueFilter("");
              setAssignedToMe(false);
            }}
            className={`${actionClass} border border-[var(--hairline)] text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]`}
          >
            Clear
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-[var(--foreground)]" role="alert">
          {error}
        </p>
      ) : null}

      {tasksQuery.isLoading ? (
        <p className="text-sm text-[var(--muted-foreground)]">Loading tasks…</p>
      ) : tasksQuery.isError ? (
        <p className="text-sm text-[var(--foreground)]">Could not load tasks.</p>
      ) : view === "list" ? (
        <TaskList
          tasks={tasks}
          tags={tagsQuery.data?.tags ?? []}
          members={membersQuery.data?.members ?? []}
          canWrite={canWrite}
          emptyLabel={
            isInbox
              ? "Inbox is empty. Add a task that is not in a project."
              : "No matching tasks."
          }
          onOpenTask={openTask}
          onStatusChange={(taskId, status) =>
            updateMutation.mutate({ taskId, patch: { status } })
          }
          onPriorityChange={(taskId, next) =>
            updateMutation.mutate({ taskId, patch: { priority: next } })
          }
          onDueChange={(taskId, dueAt) =>
            updateMutation.mutate({ taskId, patch: { dueAt } })
          }
          onDelete={(taskId) => deleteMutation.mutate(taskId)}
        />
      ) : view === "calendar" ? (
        <TaskCalendar tasks={tasks} onOpenTask={openTask} />
      ) : !projectId ? (
        <p className="text-sm text-[var(--foreground)]">No project available for board.</p>
      ) : (
        <TaskBoard
          projectId={projectId}
          tasks={tasks}
          columns={projectQuery.data?.project.columns}
          members={membersQuery.data?.members ?? []}
          canWrite={canWrite}
          onReorder={async (moves) => {
            await reorderMutation.mutateAsync(moves);
          }}
          onDelete={(taskId) => deleteMutation.mutate(taskId)}
          onOpenTask={openTask}
        />
      )}
      {drawerTaskId ? (
        <TaskDrawer
          workspaceId={workspaceId}
          taskId={drawerTaskId}
          initialTask={tasks.find((task) => task.id === drawerTaskId)}
          onClose={closeTask}
        />
      ) : null}
    </section>
  );
}

function TaskList({
  tasks,
  tags,
  members,
  canWrite,
  emptyLabel,
  onOpenTask,
  onStatusChange,
  onPriorityChange,
  onDueChange,
  onDelete,
}: {
  tasks: Task[];
  tags: Tag[];
  members: WorkspaceMember[];
  canWrite: boolean;
  emptyLabel: string;
  onOpenTask: (taskId: string) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onPriorityChange: (taskId: string, priority: TaskPriority) => void;
  onDueChange: (taskId: string, dueAt: string | null) => void;
  onDelete: (taskId: string) => void;
}) {
  if (tasks.length === 0) {
    return (
      <p className="border border-[var(--hairline)] px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">
        {emptyLabel}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-dashed divide-[var(--hairline)] border border-[var(--hairline)] bg-[var(--surface)]">
      {tasks.map((task) => (
        <li
          key={task.id}
          className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => onOpenTask(task.id)}
              className={`truncate text-left text-sm ${
                task.status === "done" || task.status === "canceled"
                  ? "text-[var(--muted-foreground)] line-through"
                  : "text-[var(--foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              {task.title}
            </button>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="font-mono text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
                {task.priority === "none" ? "no priority" : task.priority}
              </p>
              <TaskDueBadge dueAt={task.dueAt} />
              <TagChips tagIds={task.tagIds} tags={tags} />
              <AssigneeChips assigneeIds={task.assigneeIds} members={members} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={task.status}
              disabled={!canWrite}
              onChange={(event) =>
                onStatusChange(task.id, event.target.value as TaskStatus)
              }
              className="h-9 border border-[var(--hairline)] bg-[var(--bg)] px-2 text-xs text-[var(--foreground)] disabled:opacity-50"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={task.priority}
              disabled={!canWrite}
              onChange={(event) =>
                onPriorityChange(task.id, event.target.value as TaskPriority)
              }
              className="h-9 border border-[var(--hairline)] bg-[var(--bg)] px-2 text-xs text-[var(--foreground)] disabled:opacity-50"
            >
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={isoToDateInput(task.dueAt)}
              disabled={!canWrite}
              onChange={(event) =>
                onDueChange(task.id, dateInputToIso(event.target.value))
              }
              className="h-9 border border-[var(--hairline)] bg-[var(--bg)] px-2 text-xs text-[var(--foreground)] disabled:opacity-50"
            />
            {canWrite ? (
              <button
                type="button"
                onClick={() => onDelete(task.id)}
                className="h-9 border border-[var(--hairline)] px-3 text-xs text-[var(--muted-foreground)] hover:border-[var(--accent)] hover:text-[var(--foreground)]"
              >
                Delete
              </button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function useTaskRefetchInterval(): number {
  const client = useContext(RealtimeClientContext);
  const [status, setStatus] = useState(client?.getStatus() ?? "idle");

  useEffect(() => {
    if (!client) return;
    setStatus(client.getStatus());
    return client.onStatus(setStatus);
  }, [client]);

  return status === "ready" ? 60_000 : 30_000;
}
