"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { goalState, type Goal } from "@/src/core/goals";
import { dateInputToIso, isoToDateInput } from "@/src/features/task/dates";
import { useCan } from "@/src/features/workspace/WorkspaceRoleContext";
import { TaskSections, type TaskSection } from "@/src/features/task/TaskSections";
import { ProgressBar, StateChip, goalsKey } from "@/src/features/goals/goals";
import { formatDay } from "@/src/features/goals/GoalsView";

const noSubscribe = () => () => {};
const fieldClass = "h-10 border border-[var(--hairline)] bg-[var(--surface)] px-2 text-sm text-[var(--foreground)] disabled:opacity-50";
const smallButton = "rounded-[var(--r-sm)] border border-[var(--hairline)] px-2 py-0.5 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-50";

/** /w/:id/goals/:goalId — a goal's milestones and the tasks that roll up into it. */
export function GoalDetail({ workspaceId, goalId }: { workspaceId: string; goalId: string }) {
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  if (!mounted) return <p className="text-sm text-[var(--muted-foreground)]">Loading goal…</p>;
  return <Detail workspaceId={workspaceId} goalId={goalId} />;
}

function Detail({ workspaceId, goalId }: { workspaceId: string; goalId: string }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const canWrite = useCan("task.write");
  const [now] = useState(() => new Date());
  const goalKey = ["goal", goalId] as const;
  const goal = useQuery({ queryKey: goalKey, queryFn: () => api.getGoal(goalId) });
  const tasksKey = qk.tasks(workspaceId, { view: "goal", goal: goalId });
  const tasks = useQuery({ queryKey: tasksKey, queryFn: () => api.listTasks(workspaceId, { goal: goalId }) });

  const [error, setError] = useState<string | null>(null);
  const refresh = (next?: { goal: Goal }) => {
    if (next) queryClient.setQueryData(goalKey, next);
    void queryClient.invalidateQueries({ queryKey: goalsKey(workspaceId) });
    void queryClient.invalidateQueries({ queryKey: ["tasks", workspaceId] });
  };
  const change = useMutation({
    mutationFn: (run: () => Promise<{ goal: Goal }>) => run(),
    onMutate: () => setError(null),
    onSuccess: (next) => refresh(next),
    onError: (err: Error) => setError(err.message),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteGoal(goalId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: goalsKey(workspaceId) });
      router.push(`/w/${workspaceId}/goals`);
    },
    onError: (err: Error) => setError(err.message),
  });

  const [milestoneName, setMilestoneName] = useState("");
  const [milestoneDue, setMilestoneDue] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskMilestone, setTaskMilestone] = useState("");
  const addTask = useMutation({
    mutationFn: () => api.createTask(workspaceId, { title: taskTitle.trim(), projectId: null, goalId, milestoneId: taskMilestone || null }),
    onMutate: () => setError(null),
    onSuccess: () => {
      setTaskTitle("");
      void queryClient.invalidateQueries({ queryKey: goalKey });
      refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  if (goal.isPending || tasks.isPending) return <p className="text-sm text-[var(--muted-foreground)]">Loading goal…</p>;
  if (goal.isError) {
    return (
      <p role="alert" className="text-sm">
        {goal.error.message}. <Link href={`/w/${workspaceId}/goals`} className="underline">Back to goals</Link>
      </p>
    );
  }
  if (tasks.isError) return <p role="alert" className="text-sm">Could not load tasks. <button type="button" className="underline" onClick={() => void tasks.refetch()}>Retry</button></p>;

  const data = goal.data.goal;
  const known = new Set(data.milestones.map((m) => m.id));
  const open = tasks.data.tasks.filter((task) => task.status === "todo" || task.status === "in_progress");
  const doneCount = tasks.data.tasks.filter((task) => task.status === "done").length;
  const sections: TaskSection[] = [
    ...data.milestones.map((m) => ({ key: m.id, label: m.name, tasks: open.filter((task) => task.milestoneId === m.id) })),
    { key: "none", label: "No milestone", tasks: open.filter((task) => !task.milestoneId || !known.has(task.milestoneId)) },
  ].filter((section) => section.tasks.length);

  function submitMilestone(event: FormEvent) {
    event.preventDefault();
    const name = milestoneName.trim();
    if (!name) return;
    change.mutate(() => api.addMilestone(goalId, { name, dueAt: dateInputToIso(milestoneDue) }), {
      onSuccess: () => { setMilestoneName(""); setMilestoneDue(""); },
    });
  }

  function submitTask(event: FormEvent) {
    event.preventDefault();
    if (taskTitle.trim()) addTask.mutate();
  }

  return (
    <section className="flex flex-col gap-6">
      <Link href={`/w/${workspaceId}/goals`} className="text-sm text-[var(--muted-foreground)] hover:underline">← Goals</Link>
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">{data.name}</h1>
          <StateChip state={goalState(data.progress, data.targetAt, now)} />
          {data.archived ? <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">Archived</span> : null}
        </div>
        <ProgressBar progress={data.progress} label="Goal progress" />
        {canWrite ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)]">
              Name
              <input key={data.name} defaultValue={data.name} maxLength={120} className={fieldClass}
                onBlur={(event) => {
                  const name = event.target.value.trim();
                  if (name && name !== data.name) change.mutate(() => api.updateGoal(goalId, { name }));
                }} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)]">
              Target date
              <input type="date" value={isoToDateInput(data.targetAt)} className={fieldClass}
                onChange={(event) => change.mutate(() => api.updateGoal(goalId, { targetAt: dateInputToIso(event.target.value) }))} />
            </label>
            <button type="button" className={`h-10 ${smallButton} px-3 text-sm`} disabled={change.isPending}
              onClick={() => change.mutate(() => api.updateGoal(goalId, { archived: !data.archived }))}>
              {data.archived ? "Unarchive" : "Archive"}
            </button>
            <button type="button" className={`h-10 ${smallButton} px-3 text-sm`} disabled={remove.isPending}
              onClick={() => { if (window.confirm(`Delete the goal “${data.name}”? Its tasks stay, unlinked.`)) remove.mutate(); }}>
              Delete goal
            </button>
          </div>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">{data.targetAt ? `Target ${formatDay(data.targetAt)}` : "No target date"}</p>
        )}
      </header>

      {error ? <p role="alert" className="text-sm text-[var(--accent)]">{error}</p> : null}

      <div role="group" aria-labelledby="milestones-heading" className="flex flex-col gap-3">
        <h2 id="milestones-heading" className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          Milestones · {data.milestones.length}
        </h2>
        {data.milestones.length ? (
          <ul aria-label="Milestones" className="divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
            {data.milestones.map((m) => {
              const state = goalState(m.progress, m.dueAt, now);
              return (
                <li key={m.id} data-milestone={m.name} className="grid gap-2 py-3 sm:grid-cols-[1fr_14rem_auto] sm:items-center">
                  <div>
                    <p className="text-sm text-[var(--foreground)]">{m.name} <StateChip state={state} /></p>
                    <p className="text-xs text-[var(--muted-foreground)]">{m.dueAt ? `Due ${formatDay(m.dueAt)}` : "No date"}</p>
                  </div>
                  <ProgressBar progress={m.progress} label={`${m.name} progress`} />
                  {canWrite ? (
                    <button type="button" className={smallButton} disabled={change.isPending} aria-label={`Remove milestone ${m.name}`}
                      onClick={() => change.mutate(() => api.deleteMilestone(goalId, m.id))}>
                      Remove
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : <p className="text-sm text-[var(--muted-foreground)]">No milestones. Break the goal into checkpoints, or link tasks to it directly.</p>}
        {canWrite ? (
          <form onSubmit={submitMilestone} className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-[var(--muted-foreground)]">
              New milestone
              <input value={milestoneName} onChange={(event) => setMilestoneName(event.target.value)} maxLength={120} className={fieldClass} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)]">
              Due
              <input type="date" value={milestoneDue} onChange={(event) => setMilestoneDue(event.target.value)} className={fieldClass} />
            </label>
            <button type="submit" disabled={!milestoneName.trim() || change.isPending} className="h-10 rounded-[var(--r-md)] border border-[var(--hairline)] px-4 text-sm text-[var(--foreground)] hover:border-[var(--accent)] disabled:opacity-50">
              Add milestone
            </button>
          </form>
        ) : null}
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          Open tasks · {open.length}{doneCount ? ` (${doneCount} done)` : ""}
        </h2>
        {canWrite ? (
          <form onSubmit={submitTask} className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-[var(--muted-foreground)]">
              Add a task to this goal
              <input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} maxLength={500} placeholder="Goes to the Inbox" className={fieldClass} />
            </label>
            {data.milestones.length ? (
              <label className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)]">
                Milestone
                <select aria-label="Milestone" value={taskMilestone} onChange={(event) => setTaskMilestone(event.target.value)} className={fieldClass}>
                  <option value="">No milestone</option>
                  {data.milestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>
            ) : null}
            <button type="submit" disabled={!taskTitle.trim() || addTask.isPending} className="h-10 rounded-[var(--r-md)] border border-[var(--hairline)] px-4 text-sm text-[var(--foreground)] hover:border-[var(--accent)] disabled:opacity-50">
              Add task
            </button>
          </form>
        ) : null}
        {!sections.length ? <p className="text-sm text-[var(--muted-foreground)]">No open tasks on this goal.</p> : null}
        <TaskSections workspaceId={workspaceId} sections={sections} queryKey={tasksKey} />
      </div>
    </section>
  );
}
