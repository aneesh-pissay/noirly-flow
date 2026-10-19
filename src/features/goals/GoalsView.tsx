"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";
import { goalState, type Goal } from "@/src/core/goals";
import { dateInputToIso } from "@/src/features/task/dates";
import { useCan } from "@/src/features/workspace/WorkspaceRoleContext";
import { ProgressBar, StateChip, goalsKey, useGoals } from "@/src/features/goals/goals";

const noSubscribe = () => () => {};
const fieldClass = "h-10 border border-[var(--hairline)] bg-[var(--surface)] px-2 text-sm text-[var(--foreground)]";

/** /w/:id/goals — the workspace's goals and how far along each is. */
export function GoalsView({ workspaceId }: { workspaceId: string }) {
  // Overdue is judged in the viewer's days.
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  if (!mounted) return <p className="text-sm text-[var(--muted-foreground)]">Loading goals…</p>;
  return <Goals workspaceId={workspaceId} />;
}

export function formatDay(iso: string | null) {
  return iso ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso)) : null;
}

function GoalCard({ workspaceId, goal, now }: { workspaceId: string; goal: Goal; now: Date }) {
  const target = formatDay(goal.targetAt);
  return (
    <li className="rounded-[var(--r-lg)] border border-[var(--hairline)] bg-[var(--surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/w/${workspaceId}/goals/${goal.id}`} className="text-base font-medium text-[var(--foreground)] hover:underline">
          {goal.name}
        </Link>
        <StateChip state={goalState(goal.progress, goal.targetAt, now)} />
      </div>
      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
        {target ? `Target ${target}` : "No target date"}
        {goal.milestones.length ? ` · ${goal.milestones.length} milestone${goal.milestones.length === 1 ? "" : "s"}` : ""}
      </p>
      <div className="mt-3">
        <ProgressBar progress={goal.progress} label={`${goal.name} progress`} />
      </div>
    </li>
  );
}

function Goals({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const canWrite = useCan("task.write");
  const [now] = useState(() => new Date());
  const goals = useGoals(workspaceId);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const create = useMutation({
    mutationFn: () => api.createGoal(workspaceId, { name: name.trim(), targetAt: dateInputToIso(target) }),
    onSuccess: () => {
      setName("");
      setTarget("");
      void queryClient.invalidateQueries({ queryKey: goalsKey(workspaceId) });
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim()) create.mutate();
  }

  if (goals.isPending) return <p className="text-sm text-[var(--muted-foreground)]">Loading goals…</p>;
  if (goals.isError) return <p role="alert" className="text-sm">Could not load goals. <button type="button" className="underline" onClick={() => void goals.refetch()}>Retry</button></p>;

  const active = goals.data.goals.filter((goal) => !goal.archived);
  const archived = goals.data.goals.filter((goal) => goal.archived);

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Goals</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">Outcomes the workspace is working toward. Link tasks from the task drawer, or add them on a goal.</p>
      </header>

      {canWrite ? (
        <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs text-[var(--muted-foreground)]">
            New goal
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="Launch the beta" className={fieldClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)]">
            Target date
            <input type="date" value={target} onChange={(event) => setTarget(event.target.value)} className={fieldClass} />
          </label>
          <button type="submit" disabled={!name.trim() || create.isPending} className="h-10 rounded-[var(--r-md)] border border-[var(--hairline)] px-4 text-sm text-[var(--foreground)] hover:border-[var(--accent)] disabled:opacity-50">
            Add goal
          </button>
          {create.isError ? <p role="alert" className="w-full text-sm text-[var(--accent)]">{create.error.message}</p> : null}
        </form>
      ) : null}

      {active.length ? (
        <ul aria-label="Goals" className="grid gap-3 md:grid-cols-2">
          {active.map((goal) => <GoalCard key={goal.id} workspaceId={workspaceId} goal={goal} now={now} />)}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-[var(--hairline)] p-6 text-center text-sm text-[var(--muted-foreground)]">No goals yet.</p>
      )}

      {archived.length ? (
        <div>
          <button type="button" aria-expanded={showArchived} onClick={() => setShowArchived((open) => !open)} className="text-sm text-[var(--muted-foreground)] underline">
            {showArchived ? "Hide" : "Show"} archived ({archived.length})
          </button>
          {showArchived ? (
            <ul aria-label="Archived goals" className="mt-3 grid gap-3 opacity-80 md:grid-cols-2">
              {archived.map((goal) => <GoalCard key={goal.id} workspaceId={workspaceId} goal={goal} now={now} />)}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
