"use client";

import { useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import type { Task } from "@/src/core/sync/types";
import { groupOpen, isMine, movedDue, type MoveTarget } from "@/src/core/review";
import { daysAgo, weekStart } from "@/src/core/stats";
import { useCan } from "@/src/features/workspace/WorkspaceRoleContext";
import { TaskSections, type TaskSection } from "@/src/features/task/TaskSections";

type Mode = "daily" | "weekly";
const OPEN = "todo,in_progress";
const noSubscribe = () => () => {};

/** /w/:id/review — a daily or weekly pass over your own tasks. */
export function ReviewView({ workspaceId }: { workspaceId: string }) {
  // Days are the viewer's, and the last-reviewed time lives in this browser.
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  if (!mounted) return <p className="text-sm text-[var(--muted-foreground)]">Loading review…</p>;
  return <Review workspaceId={workspaceId} />;
}

const reviewedKey = (workspaceId: string, mode: Mode) => `flow.reviewed.${workspaceId}.${mode}`;

function readReviewed(workspaceId: string, mode: Mode) {
  try {
    return window.localStorage.getItem(reviewedKey(workspaceId, mode));
  } catch {
    return null;
  }
}

function Review({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const canWrite = useCan("task.write");
  const [now] = useState(() => new Date());
  const [mode, setMode] = useState<Mode>("daily");
  const [reviewed, setReviewed] = useState(() => ({
    daily: readReviewed(workspaceId, "daily"),
    weekly: readReviewed(workspaceId, "weekly"),
  }));
  const since = mode === "daily" ? daysAgo(now, 0) : weekStart(now);

  const me = useQuery({ queryKey: ["me"], queryFn: () => api.me(), staleTime: 60_000 });
  const openKey = qk.tasks(workspaceId, { view: "review", status: OPEN });
  const open = useQuery({ queryKey: openKey, queryFn: () => api.listTasks(workspaceId, { status: OPEN }) });
  const done = useQuery({
    queryKey: qk.tasks(workspaceId, { view: "review", status: "done", completedAfter: since.toISOString() }),
    queryFn: () => api.listTasks(workspaceId, { status: "done", completedAfter: since.toISOString() }),
  });

  const [error, setError] = useState<string | null>(null);
  const move = useMutation({
    mutationFn: ({ task, target }: { task: Task; target: MoveTarget }) => api.updateTask(task.id, movedDue(task, target, now)),
    onMutate: () => setError(null),
    onError: (err: Error) => setError(err.message),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["tasks", workspaceId] }),
  });

  function markReviewed() {
    const at = new Date().toISOString();
    try {
      window.localStorage.setItem(reviewedKey(workspaceId, mode), at);
    } catch {
      // Private mode or blocked storage: remember it for this visit only.
    }
    setReviewed((old) => ({ ...old, [mode]: at }));
  }

  if (me.isPending || open.isPending || done.isPending) return <p className="text-sm text-[var(--muted-foreground)]">Loading review…</p>;
  if (me.isError || open.isError || done.isError) {
    return <p role="alert" className="text-sm">Could not load your review. <button type="button" className="underline" onClick={() => { void me.refetch(); void open.refetch(); void done.refetch(); }}>Retry</button></p>;
  }

  const meId = me.data.user.id;
  const mine = open.data.tasks.filter((task) => isMine(task, meId));
  const finished = done.data.tasks.filter((task) => isMine(task, meId));
  const groups = groupOpen(mine, now);
  const fmt = (date: Date, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(undefined, options).format(date);

  const sections: TaskSection[] = mode === "daily"
    ? [
      { key: "overdue", label: "Overdue", tasks: groups.overdue, tone: "alert" },
      { key: "today", label: "Still open today", tasks: groups.today },
      { key: "tomorrow", label: "Tomorrow", tasks: groups.tomorrow },
    ]
    : [
      { key: "overdue", label: "Overdue", tasks: groups.overdue, tone: "alert" },
      ...nextWeekByDay(groups.nextWeek, fmt),
      { key: "undated", label: "No date", tasks: groups.undated },
    ];
  const shown = sections.filter((section) => section.tasks.length);
  const lastReviewed = reviewed[mode];

  const moveButton = (task: Task, target: MoveTarget, label: string) => (
    <button
      type="button"
      disabled={!canWrite || move.isPending}
      onClick={() => move.mutate({ task, target })}
      aria-label={`${label}: ${task.title}`}
      className="rounded-[var(--r-sm)] border border-[var(--hairline)] px-2 py-0.5 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-50"
    >
      {label}
    </button>
  );

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">Review</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            {mode === "daily" ? fmt(now, { weekday: "long", month: "long", day: "numeric" }) : `Week of ${fmt(since, { month: "long", day: "numeric" })}`}
            {" · "}
            {lastReviewed ? `Last reviewed ${fmt(new Date(lastReviewed), { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "Not reviewed yet"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div role="group" aria-label="Review period" className="flex rounded-[var(--r-md)] border border-[var(--hairline)] p-0.5">
            {(["daily", "weekly"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
                className={`rounded-[var(--r-sm)] px-3 py-1 text-sm ${mode === value ? "bg-[var(--surface)] text-[var(--foreground)]" : "text-[var(--muted-foreground)]"}`}
              >
                {value === "daily" ? "Daily" : "Weekly"}
              </button>
            ))}
          </div>
          <button type="button" onClick={markReviewed} className="rounded-[var(--r-md)] border border-[var(--hairline)] px-3 py-1.5 text-sm text-[var(--foreground)] hover:border-[var(--accent)]">
            Mark reviewed
          </button>
        </div>
      </header>

      <div role="group" aria-labelledby="review-done">
        <h2 id="review-done" className="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          {mode === "daily" ? "Done today" : "Done this week"} <span>· {finished.length}</span>
        </h2>
        {finished.length ? (
          <ul className="divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
            {finished.map((task) => (
              <li key={task.id} data-done-row={task.title} className="py-2 text-sm text-[var(--muted-foreground)] line-through">{task.title}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">{mode === "daily" ? "Nothing finished yet today." : "Nothing finished yet this week."}</p>
        )}
      </div>

      {error ? <p role="alert" className="text-sm text-[var(--accent)]">{error}</p> : null}
      {!shown.length ? (
        <p className="rounded-xl border border-dashed border-[var(--hairline)] p-6 text-center text-sm text-[var(--muted-foreground)]">
          {mode === "daily" ? "Nothing overdue, left for today or due tomorrow." : "Nothing overdue, planned for next week or undated."}
        </p>
      ) : null}
      <TaskSections
        workspaceId={workspaceId}
        sections={shown}
        queryKey={openKey}
        actions={(task) => (
          <>
            {mode === "daily" && !isOn(groups.tomorrow, task) ? moveButton(task, "tomorrow", "Tomorrow") : null}
            {!isOn(groups.nextWeek, task) ? moveButton(task, "next-week", "Next week") : null}
            {task.dueAt ? moveButton(task, "none", "Clear date") : null}
          </>
        )}
      />
    </section>
  );
}

const isOn = (list: Task[], task: Task) => list.some((item) => item.id === task.id);

function nextWeekByDay(tasks: Task[], fmt: (date: Date, options: Intl.DateTimeFormatOptions) => string): TaskSection[] {
  const days = new Map<string, TaskSection>();
  for (const task of tasks) {
    const due = new Date(task.dueAt!);
    const key = `${due.getFullYear()}-${due.getMonth()}-${due.getDate()}`;
    const section = days.get(key) ?? { key: `next-${key}`, label: fmt(due, { weekday: "long", month: "short", day: "numeric" }), tasks: [] };
    section.tasks.push(task);
    days.set(key, section);
  }
  return [...days.values()];
}
