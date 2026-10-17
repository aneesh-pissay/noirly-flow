"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import type { Task } from "@/src/core/sync/types";
import type { TaskPriority, TaskStatus } from "@/src/core/models/enums";
import { ActivityFeed } from "@/src/features/activity/ActivityFeed";
import { CommentThread } from "@/src/features/comments/CommentThread";
import { TaskAttachments } from "@/src/features/task/TaskAttachments";
import { dateInputToIso, dueInputToIso, isoToDateInput, isoToTimeInput, startAfterDue } from "@/src/features/task/dates";
import { TaskDatePicker } from "@/src/features/task/TaskDatePicker";
import { TaskDurationSelect } from "@/src/features/task/TaskDurationSelect";
import { TaskRepeatPicker } from "@/src/features/task/TaskRepeatPicker";
import { TaskReminderSelect } from "@/src/features/task/TaskReminderSelect";
import { TagPicker } from "@/src/features/tags/tags";
import { priorityTextClassName } from "@/src/features/task/priority";
import { useCan } from "@/src/features/workspace/WorkspaceRoleContext";
import {
  patchCachedTask,
  restoreTaskQueries,
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

type Props = {
  workspaceId: string;
  taskId: string;
  initialTask?: Task;
  onClose: () => void;
};

const noSubscribe = () => () => {};

export function TaskDrawer({ workspaceId, taskId, initialTask, onClose }: Props) {
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  const queryClient = useQueryClient();
  const canWrite = useCan("task.write");
  const [title, setTitle] = useState(initialTask?.title ?? "");
  const [description, setDescription] = useState(initialTask?.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(initialTask?.status ?? "todo");
  const [priority, setPriority] = useState<TaskPriority>(
    initialTask?.priority ?? "none",
  );
  const [dueDate, setDueDate] = useState(isoToDateInput(initialTask?.dueAt ?? null));
  const [dueTime, setDueTime] = useState(isoToTimeInput(initialTask?.dueAt ?? null, initialTask?.dueHasTime ?? false));
  const [startDate, setStartDate] = useState(isoToDateInput(initialTask?.startAt ?? null));
  const [deadline, setDeadline] = useState(isoToDateInput(initialTask?.deadlineAt ?? null));
  const [duration, setDuration] = useState<number | null>(initialTask?.durationMinutes ?? null);
  const [recurrence, setRecurrence] = useState<Task["recurrence"]>(initialTask?.recurrence ?? null);
  const [reminder, setReminder] = useState<number | null>(initialTask?.reminderMinutes ?? null);
  const [tagIds, setTagIds] = useState<string[]>(initialTask?.tagIds ?? []);
  const [dateError, setDateError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | "">(
    initialTask?.projectId ?? "",
  );
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    initialTask?.assigneeIds ?? [],
  );
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const meQuery = useQuery({ queryKey: ["me"], queryFn: () => api.me() });
  const manual = meQuery.data?.user.profile.taskSaveMode === "manual";

  const taskQuery = useQuery({
    queryKey: qk.task(taskId),
    queryFn: () => api.getTask(taskId),
    initialData: initialTask ? { task: initialTask } : undefined,
    initialDataUpdatedAt: initialTask ? 0 : undefined,
  });

  const projectsQuery = useQuery({
    queryKey: qk.projects(workspaceId),
    queryFn: () => api.listProjects(workspaceId),
  });

  const membersQuery = useQuery({
    queryKey: qk.members(workspaceId),
    queryFn: () => api.listMembers(workspaceId),
  });

  const [syncedTask, setSyncedTask] = useState(initialTask);
  const incomingTask = taskQuery.data?.task;
  if (!dirty && incomingTask && incomingTask !== syncedTask) {
    const task = incomingTask;
    setSyncedTask(task);
    setTitle(task.title);
    setDescription(task.description ?? "");
    setStatus(task.status);
    setPriority(task.priority);
    setDueDate(isoToDateInput(task.dueAt));
    setDueTime(isoToTimeInput(task.dueAt, task.dueHasTime));
    setStartDate(isoToDateInput(task.startAt));
    setDeadline(isoToDateInput(task.deadlineAt));
    setDuration(task.durationMinutes ?? null);
    setRecurrence(task.recurrence ?? null);
    setReminder(task.reminderMinutes ?? null);
    setTagIds(task.tagIds ?? []);
    setProjectId(task.projectId ?? "");
    setAssigneeIds(task.assigneeIds ?? []);
  }

  const saveMutation = useMutation({
    mutationFn: (patch: Partial<Task>) => api.updateTask(taskId, patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: ["tasks", workspaceId] });
      const previous = snapshotTaskQueries(queryClient, workspaceId);
      patchCachedTask(queryClient, workspaceId, taskId, patch);
      setError(null);
      return { previous };
    },
    onSuccess: (data) => {
      upsertCachedTask(queryClient, workspaceId, data.task);
      setDirty(false);
    },
    onError: (err: Error, _patch, context) => {
      if (context?.previous) {
        restoreTaskQueries(queryClient, context.previous);
      }
      setError(err.message);
    },
  });

  const canEdit = canWrite && Boolean(meQuery.data) && !saveMutation.isPending;
  const close = useCallback(() => {
    if (saveMutation.isPending) return;
    if (dirty && !window.confirm("Discard unsaved task changes?")) return;
    onClose();
  }, [dirty, onClose, saveMutation.isPending]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    function onUnload(event: BeforeUnloadEvent) {
      if (!dirty && !saveMutation.isPending) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [close, dirty, saveMutation.isPending]);

  function save(patch: Partial<Task> = {}) {
    if (!canEdit) return;
    const nextTitle = typeof patch.title === "string" ? patch.title.trim() : title.trim();
    if (!nextTitle) { setError("A task title is required."); return; }
    const values = {
      title: nextTitle, description: description.trim() || null, status, priority,
      projectId: projectId || null, dueAt: dueInputToIso(dueDate, dueTime),
      dueHasTime: Boolean(dueDate && dueTime), startAt: dateInputToIso(startDate), deadlineAt: dateInputToIso(deadline), durationMinutes: duration, assigneeIds, tagIds, ...patch,
    };
    const changes = Object.fromEntries(
      Object.entries(values).filter(([key, value]) =>
        JSON.stringify(value) !== JSON.stringify(syncedTask?.[key as keyof Task]),
      ),
    ) as Partial<Task>;
    if (!Object.keys(changes).length) { setDirty(false); setError(null); return; }
    saveMutation.mutate(changes);
  }

  function persist(patch: Partial<Task>) {
    if (!canEdit) return;
    setDirty(true);
    if (!manual) save(patch);
  }

  const projects = projectsQuery.data?.projects ?? [];
  const task = taskQuery.data?.task ?? initialTask;

  // A ?task= deep link renders the drawer on the server, where there's no
  // <body> to portal into; it appears once hydrated.
  if (!mounted) return null;

  // Portaled to <body>: <main> is its own stacking context (effects.css), so
  // anything fixed inside it paints under the app header no matter its z-index.
  // Outside the shell it also needs its own Lenis opt-out to scroll.
  return createPortal(
    <div data-lenis-prevent className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label="Close task"
        className="absolute inset-0 cursor-pointer bg-[var(--bg)]/60"
        onClick={close}
      />
      <aside className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-[var(--hairline)] bg-[var(--bg)]">
        <header className="flex items-center justify-between border-b border-[var(--hairline)] px-5 py-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            Task
          </p>
          <button
            type="button"
            onClick={close}
            className="cursor-pointer text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            Close
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {canWrite ? <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--hairline)] pb-4">
            <p role="status" className="text-xs text-[var(--muted-foreground)]">
              {saveMutation.isPending ? "Saving…" : dirty ? "Unsaved changes" : manual ? "Manual saving" : "Automatic saving"}
            </p>
            {(manual || dirty) ? <button type="button" disabled={!dirty || !canEdit || !title.trim()}
              onClick={() => save()}
              className="min-h-10 rounded-xl bg-[var(--accent)] px-3 text-sm text-[var(--accent-ink)] disabled:opacity-50">Save changes</button> : null}
            {meQuery.isError ? <p role="alert" className="w-full text-sm">Could not load save preferences. <button type="button" className="underline" onClick={() => void meQuery.refetch()}>Retry</button></p> : null}
          </div> : null}
          {!task && taskQuery.isPending ? (
            <p className="text-sm text-[var(--muted-foreground)]">Loading…</p>
          ) : taskQuery.isError && !task ? (
            <p className="text-sm text-[var(--foreground)]">Could not load task.</p>
          ) : task ? (
            <>
              <input
                value={title}
                readOnly={!canEdit}
                onChange={(event) => { setTitle(event.target.value); setDirty(true); }}
                aria-label="Task title"
                maxLength={500}
                onBlur={() => {
                  if (dirty && title.trim()) persist({ title: title.trim() });
                }}
                className="w-full bg-transparent text-xl font-semibold text-[var(--foreground)] outline-none read-only:text-[var(--muted-foreground)]"
              />

              <textarea
                value={description}
                readOnly={!canEdit}
                onChange={(event) => { setDescription(event.target.value); setDirty(true); }}
                aria-label="Task description"
                maxLength={20000}
                onBlur={() => { if (dirty) persist({ description: description.trim() || null }); }}
                placeholder="Add a description…"
                rows={3}
                className="w-full resize-none border border-[var(--hairline)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)] read-only:text-[var(--muted-foreground)]"
              />

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 text-xs text-[var(--muted-foreground)]">
                  Status
                  <select
                    value={status}
                    disabled={!canEdit}
                    onChange={(event) => {
                      const next = event.target.value as TaskStatus;
                      setStatus(next);
                      persist({ status: next });
                    }}
                    className="h-10 w-full border border-[var(--hairline)] bg-[var(--surface)] px-2 text-sm text-[var(--foreground)] disabled:opacity-50"
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs text-[var(--muted-foreground)]">
                  Priority
                  <select
                    value={priority}
                    disabled={!canEdit}
                    onChange={(event) => {
                      const next = event.target.value as TaskPriority;
                      setPriority(next);
                      persist({ priority: next });
                    }}
                    className={`h-10 w-full border border-[var(--hairline)] bg-[var(--surface)] px-2 text-sm disabled:opacity-50 ${priorityTextClassName(priority)}`}
                  >
                    {PRIORITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value} className={OPTION_CLASS}>
                        {option.label}
                      </option>
                    ))}
                    {/* No longer offered, but tasks set to it earlier still show it. */}
                    {priority === "urgent" ? <option value="urgent" className={OPTION_CLASS}>Urgent</option> : null}
                  </select>
                </label>
                <label className="col-span-2 space-y-1 text-xs text-[var(--muted-foreground)]">
                  Project
                  <select
                    value={projectId}
                    disabled={!canEdit}
                    onChange={(event) => {
                      const next = event.target.value;
                      setProjectId(next);
                      persist({ projectId: next || null });
                    }}
                    className="h-10 w-full border border-[var(--hairline)] bg-[var(--surface)] px-2 text-sm text-[var(--foreground)] disabled:opacity-50"
                  >
                    <option value="">Inbox</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="col-span-2 space-y-1 text-xs text-[var(--muted-foreground)]">
                  <span>Start date</span>
                  <TaskDatePicker value={startDate} withTime={false} name="start date" disabled={!canEdit} onChange={(value) => {
                    if (startAfterDue(value, dueDate)) { setDateError("The start date can't be after the due date."); return; }
                    if (startAfterDue(value, deadline)) { setDateError("The start date can't be after the deadline."); return; }
                    setDateError(null);
                    setStartDate(value);
                    persist({ startAt: dateInputToIso(value) });
                  }} />
                </div>
                <div className="col-span-2 space-y-1 text-xs text-[var(--muted-foreground)]">
                  <span>Due date</span>
                  <TaskDatePicker value={dueDate} time={dueTime} disabled={!canEdit} onChange={(value, time) => {
                    if (startAfterDue(startDate, value)) { setDateError("The due date can't be before the start date."); return; }
                    setDateError(null);
                    setDueDate(value);
                    setDueTime(time);
                    persist({ dueAt: dueInputToIso(value, time), dueHasTime: Boolean(value && time) });
                  }} />
                </div>
                <div className="col-span-2 space-y-1 text-xs text-[var(--muted-foreground)]">
                  <span>Deadline</span>
                  <TaskDatePicker value={deadline} withTime={false} name="deadline" disabled={!canEdit} onChange={(value) => {
                    if (startAfterDue(startDate, value)) { setDateError("The deadline can't be before the start date."); return; }
                    setDateError(null);
                    setDeadline(value);
                    persist({ deadlineAt: dateInputToIso(value) });
                  }} />
                  {dateError ? <p role="alert" className="text-xs text-[var(--accent)]">{dateError}</p> : null}
                </div>
                <label className="col-span-2 space-y-1 text-xs text-[var(--muted-foreground)]">
                  Duration
                  <TaskDurationSelect value={duration} disabled={!canEdit} onChange={(minutes) => {
                    setDuration(minutes);
                    persist({ durationMinutes: minutes });
                  }} className="h-10 w-full border border-[var(--hairline)] bg-[var(--surface)] px-2 text-sm text-[var(--foreground)] disabled:opacity-50" />
                </label>
                <label className="col-span-2 space-y-1 text-xs text-[var(--muted-foreground)]">
                  Reminder
                  <TaskReminderSelect value={reminder} hasTime={Boolean(dueDate && dueTime)} disabled={!canEdit} onChange={(minutes) => {
                    setReminder(minutes);
                    persist({ reminderMinutes: minutes });
                  }} className="h-10 w-full border border-[var(--hairline)] bg-[var(--surface)] px-2 text-sm text-[var(--foreground)] disabled:opacity-50" />
                </label>
                <div className="col-span-2 space-y-1 text-xs text-[var(--muted-foreground)]">
                  <span>Tags</span>
                  <TagPicker workspaceId={workspaceId} value={tagIds} disabled={!canEdit} onChange={(next) => {
                    setTagIds(next);
                    persist({ tagIds: next });
                  }} />
                </div>
                <div className="col-span-2 space-y-1 text-xs text-[var(--muted-foreground)]">
                  <span>Repeat</span>
                  <TaskRepeatPicker value={recurrence} date={dueDate || startDate} disabled={!canEdit} onChange={(rule) => {
                    setRecurrence(rule);
                    persist({ recurrence: rule });
                  }} selectClassName="h-10 w-full border border-[var(--hairline)] bg-[var(--surface)] px-2 text-sm text-[var(--foreground)] disabled:opacity-50" />
                </div>
              </div>

              <section>
                <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                  Assignees
                </p>
                <div className="flex flex-wrap gap-2">
                  {(membersQuery.data?.members ?? []).map((member) => {
                    const selected = assigneeIds.includes(member.userId);
                    return (
                      <button
                        key={member.userId}
                        type="button"
                        disabled={!canEdit}
                        onClick={() => {
                          const next = selected
                            ? assigneeIds.filter((id) => id !== member.userId)
                            : [...assigneeIds, member.userId];
                          setAssigneeIds(next);
                          persist({ assigneeIds: next });
                        }}
                        className={`border px-3 py-1 text-xs disabled:opacity-50 ${
                          selected
                            ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                            : "border-[var(--hairline)] text-[var(--muted-foreground)]"
                        }`}
                      >
                        {member.displayName}
                      </button>
                    );
                  })}
                  {membersQuery.isLoading ? (
                    <span className="text-xs text-[var(--muted-foreground)]">Loading members…</span>
                  ) : null}
                </div>
              </section>

              <TaskAttachments taskId={taskId} canWrite={canWrite} />

              <CommentThread
                taskId={taskId}
                workspaceId={workspaceId}
                members={membersQuery.data?.members ?? []}
                canWrite={canWrite}
              />
              <ActivityFeed
                workspaceId={workspaceId}
                taskId={taskId}
                members={membersQuery.data?.members ?? []}
              />
            </>
          ) : null}
          {error ? (
            <p className="text-sm text-[var(--foreground)]" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
