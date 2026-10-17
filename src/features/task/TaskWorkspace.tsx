"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RealtimeClientContext } from "@noirly-dev/realtime-client/react";
import { useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { qk } from "@/src/core/sync/query-keys";
import { api } from "@/src/lib/api-client";
import { useUIStore } from "@/src/stores/ui-store";
import type { Task } from "@/src/core/sync/types";
import type { TaskPriority, TaskStatus } from "@/src/core/models/enums";
import { TaskBoard } from "@/src/features/task/TaskBoard";
import { AddSection, groupBySection, NoSectionHeader, SectionHeader, useSections } from "@/src/features/task/ProjectSections";
import { TaskCalendar } from "@/src/features/task/TaskCalendar";
import { TaskTagChips, useTags } from "@/src/features/tags/tags";
import { TaskDeadlineBadge, TaskDueBadge, TaskDurationBadge, TaskRepeatBadge, TaskStartBadge } from "@/src/features/task/TaskDueBadge";
import { PriorityBadge, priorityTextClassName } from "@/src/features/task/priority";
import { AssigneeChips } from "@/src/features/task/AssigneeChips";
import { TaskDrawer } from "@/src/features/task/TaskDrawer";
import { ProjectRealtime } from "@/src/features/realtime/ProjectRealtime";
import type { WorkspaceMember } from "@/src/features/workspace/members";
import { useCan } from "@/src/features/workspace/WorkspaceRoleContext";
import {
  dueInputToIso,
  isoToDateInput,
  isoToTimeInput,
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

/** The priority <select> is tinted; keep its open list in the normal text colour. */
const OPTION_CLASS = "text-[var(--foreground)]";

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "none", label: "None" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
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
  const [tagFilter, setTagFilter] = useState("");
  const tagsQuery = useTags(workspaceId);
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
      tag: tagFilter || undefined,
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
      tagFilter,
    ],
  );

  const hasActiveFilters = Boolean(
    search || statusFilter || priorityFilter || dueFilter || assignedToMe || tagFilter,
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
      const title = tasksQuery.data?.tasks.find((task) => task.id === taskId)?.title ?? "Task";
      if (drawerTaskId === taskId) {
        setDrawerTaskId(null);
        writeTaskParam(null);
      }
      removeCachedTask(queryClient, workspaceId, taskId);
      setError(null);
      return { previous, title };
    },
    onSuccess: (_data, taskId, context) => {
      setUndoable({ id: taskId, title: context.title });
      void queryClient.invalidateQueries({ queryKey: qk.trash(workspaceId) });
    },
    onError: (err: Error, _taskId, context) => {
      if (context?.previous) {
        restoreTaskQueries(queryClient, context.previous);
      }
      setError(err.message);
    },
  });

  // The last deleted task, offered back for a few seconds; older ones live in Trash.
  const [undoable, setUndoable] = useState<{ id: string; title: string } | null>(null);
  useEffect(() => {
    if (!undoable) return;
    const timer = window.setTimeout(() => setUndoable(null), 8000);
    return () => window.clearTimeout(timer);
  }, [undoable]);

  const restoreMutation = useMutation({
    mutationFn: (taskId: string) => api.restoreTask(taskId),
    onSuccess: () => {
      setUndoable(null);
      void queryClient.invalidateQueries({ queryKey: ["tasks", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: qk.trash(workspaceId) });
    },
    onError: (err: Error) => setError(err.message),
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
  const sections = useSections(projectId).data?.sections ?? [];

  /** The list view's rows for some of the tasks (all of them, or one section's). */
  function renderList(list: Task[], emptyLabel: string) {
    return (
      <TaskList
        tasks={list}
        members={membersQuery.data?.members ?? []}
        canWrite={canWrite}
        emptyLabel={emptyLabel}
        onOpenTask={openTask}
        onStatusChange={(taskId, status) =>
          updateMutation.mutate({ taskId, patch: { status } })
        }
        onPriorityChange={(taskId, next) =>
          updateMutation.mutate({ taskId, patch: { priority: next } })
        }
        onDueChange={(taskId, dueAt, dueHasTime) =>
          updateMutation.mutate({ taskId, patch: { dueAt, dueHasTime } })
        }
        onDelete={(taskId) => deleteMutation.mutate(taskId)}
      />
    );
  }

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
            {projectId ? (
              <Link
                href={`/w/${workspaceId}/p/${projectId}/chat`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--hairline)] px-3 py-2 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
              >
                <MessageSquare size={14} aria-hidden />
                Chat
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      {canWrite ? (
      <button type="button"
        onClick={() => useUIStore.getState().openTaskForm({ workspaceId, projectId })}
        className={`${actionClass} bg-[var(--accent)] font-medium text-[var(--accent-ink)]`}>
        New task
      </button>
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
            <option key={option.value} value={option.value} className={OPTION_CLASS}>
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
        {tagsQuery.data?.tags.length ? (
          <select
            value={tagFilter}
            aria-label="Tag"
            onChange={(event) => setTagFilter(event.target.value)}
            className={`${fieldClass} cursor-pointer`}
          >
            <option value="">Any tag</option>
            {tagsQuery.data.tags.map((tag) => (
              <option key={tag.id} value={tag.id}>@{tag.name}</option>
            ))}
          </select>
        ) : null}
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
              setTagFilter("");
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

      <div role="status">
        {undoable ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--r-lg)] border border-[var(--hairline)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
            <span className="min-w-0 truncate">Deleted “{undoable.title}”.</span>
            <button
              type="button"
              disabled={restoreMutation.isPending}
              onClick={() => restoreMutation.mutate(undoable.id)}
              className="cursor-pointer font-medium text-[var(--accent)] underline-offset-2 hover:underline disabled:opacity-50"
            >
              {restoreMutation.isPending ? "Restoring…" : "Undo"}
            </button>
            <Link href={`/w/${workspaceId}/trash`} className="underline-offset-2 hover:text-[var(--foreground)] hover:underline">
              View trash
            </Link>
          </p>
        ) : null}
      </div>

      {tasksQuery.isLoading ? (
        <p className="text-sm text-[var(--muted-foreground)]">Loading tasks…</p>
      ) : tasksQuery.isError ? (
        <p className="text-sm text-[var(--foreground)]">Could not load tasks.</p>
      ) : view === "list" && projectId && sections.length ? (
        // Grouped by section: "No section" first, then each section in order.
        <div className="flex flex-col gap-6">
          {groupBySection(tasks, sections).map(({ section, tasks: groupTasks }) => (
            <div key={section?.id ?? "none"} role="group" aria-label={section ? `Section ${section.name}` : "No section"}>
              {section ? (
                <SectionHeader workspaceId={workspaceId} section={section} count={groupTasks.length} canWrite={canWrite} />
              ) : (
                <NoSectionHeader count={groupTasks.length} />
              )}
              {renderList(groupTasks, section ? "No tasks in this section." : "No matching tasks.")}
            </div>
          ))}
          {canWrite ? <AddSection projectId={projectId} /> : null}
        </div>
      ) : view === "list" ? (
        <div className="flex flex-col gap-4">
          {renderList(
            tasks,
            isInbox ? "Inbox is empty. Add a task that is not in a project." : "No matching tasks.",
          )}
          {projectId && canWrite ? <AddSection projectId={projectId} /> : null}
        </div>
      ) : view === "calendar" ? (
        <TaskCalendar tasks={tasks} onOpenTask={openTask} />
      ) : !projectId ? (
        <p className="text-sm text-[var(--foreground)]">No project available for board.</p>
      ) : projectQuery.isPending ? (
        // Columns decide where cards go; placeholder columns swapped for the
        // real ones mid-drag would drop the card nowhere.
        <p className="text-sm text-[var(--muted-foreground)]">Loading board…</p>
      ) : (
        <TaskBoard
          workspaceId={workspaceId}
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
          key={drawerTaskId}
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
  members: WorkspaceMember[];
  canWrite: boolean;
  emptyLabel: string;
  onOpenTask: (taskId: string) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onPriorityChange: (taskId: string, priority: TaskPriority) => void;
  onDueChange: (taskId: string, dueAt: string | null, dueHasTime: boolean) => void;
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
          onClick={(event) => {
            // The title button is the keyboard and screen-reader way in; this
            // makes the rest of the row a mouse target too. Controls in the
            // row keep their own behaviour, and selecting text doesn't open.
            if ((event.target as HTMLElement).closest("button, a, input, select, textarea, label")) return;
            if (window.getSelection()?.toString()) return;
            onOpenTask(task.id);
          }}
          className="flex cursor-pointer flex-col gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-2)] sm:flex-row sm:items-center sm:justify-between"
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
              <PriorityBadge priority={task.priority} />
              <TaskStartBadge startAt={task.startAt} />
              <TaskDueBadge dueAt={task.dueAt} hasTime={task.dueHasTime} />
              <TaskDeadlineBadge deadlineAt={task.deadlineAt} />
              <TaskDurationBadge minutes={task.durationMinutes} />
              <TaskRepeatBadge rule={task.recurrence} />
              <TaskTagChips workspaceId={task.workspaceId} tagIds={task.tagIds} />
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
              className={`h-9 border border-[var(--hairline)] bg-[var(--bg)] px-2 text-xs disabled:opacity-50 ${priorityTextClassName(task.priority)}`}
            >
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} className={OPTION_CLASS}>
                  {option.label}
                </option>
              ))}
              {/* No longer offered, but tasks set to it earlier still show it. */}
              {task.priority === "urgent" ? <option value="urgent" className={OPTION_CLASS}>Urgent</option> : null}
            </select>
            <input
              type="date"
              value={isoToDateInput(task.dueAt)}
              disabled={!canWrite}
              onChange={(event) => {
                // Changing the day keeps the task's time, if it has one.
                const time = isoToTimeInput(task.dueAt, task.dueHasTime);
                const date = event.target.value;
                onDueChange(task.id, dueInputToIso(date, time), Boolean(date && time));
              }}
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
  const subscribe = useCallback(
    (notify: () => void) => client?.onStatus(notify) ?? (() => {}),
    [client],
  );
  const getSnapshot = useCallback(() => client?.getStatus() ?? "idle", [client]);
  const status = useSyncExternalStore(subscribe, getSnapshot, () => "idle");

  return status === "ready" ? 60_000 : 30_000;
}
