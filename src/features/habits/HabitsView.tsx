"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Flame } from "lucide-react";
import { api } from "@/src/lib/api-client";
import { habitStats, type OccurrenceState } from "@/src/core/habits";
import { describeRecurrence } from "@/src/features/task/recurrence";
import { useCan } from "@/src/features/workspace/WorkspaceRoleContext";

/** History squares shown per habit. */
const RECENT = 14;
const STATE_STYLE: Record<OccurrenceState, string> = {
  "on-time": "bg-[var(--accent)]",
  late: "bg-amber-400",
  overdue: "bg-red-500",
  open: "border border-[var(--accent)]",
  skipped: "bg-[var(--surface-2)]",
};
const STATE_LABEL: Record<OccurrenceState, string> = {
  "on-time": "done on time",
  late: "done late",
  overdue: "missed",
  open: "to do",
  skipped: "skipped",
};
const noSubscribe = () => () => {};

/** /w/:id/habits — repeating tasks tracked as habits, with their streaks. */
export function HabitsView({ workspaceId }: { workspaceId: string }) {
  // Streaks count the viewer's days.
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  const queryClient = useQueryClient();
  const canWrite = useCan("task.write");
  const habits = useQuery({ queryKey: ["habits", workspaceId], queryFn: () => api.listHabits(workspaceId) });
  const done = useMutation({
    mutationFn: (taskId: string) => api.updateTask(taskId, { status: "done" }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["habits", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["tasks", workspaceId] });
    },
  });
  if (!mounted) return <p className="text-sm text-[var(--muted-foreground)]">Loading habits…</p>;

  const list = habits.data?.habits ?? [];
  return (
    <section className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Habits</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Repeating tasks marked as habits. A streak is how many times in a row it was done by its due day.
        </p>
      </header>
      {done.isError ? <p role="alert" className="text-sm text-[var(--accent)]">{(done.error as Error).message}</p> : null}
      {habits.data && !list.length ? (
        <p className="rounded-xl border border-dashed border-[var(--hairline)] p-6 text-center text-sm text-[var(--muted-foreground)]">
          No habits yet. Give a task a repeat, then tick “Track as a habit” in its drawer.
        </p>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2">
        {list.map(({ seriesId, task, occurrences }) => {
          const stats = habitStats(occurrences);
          const recent = stats.history.slice(-RECENT);
          const open = task.status === "todo" || task.status === "in_progress";
          return (
            <li key={seriesId} role="group" aria-label={`Habit ${task.title}`}
              className="rounded-[var(--r-lg)] border border-[var(--hairline)] bg-[var(--surface)] p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/w/${workspaceId}/t/${task.id}`} className="block truncate font-medium text-[var(--foreground)] hover:underline">{task.title}</Link>
                  <p className="text-xs text-[var(--muted-foreground)]">{task.recurrence ? describeRecurrence(task.recurrence) : "No longer repeats"}</p>
                </div>
                <p className="flex shrink-0 items-center gap-1 text-sm text-[var(--foreground)]" aria-label={`Current streak ${stats.current}, best ${stats.best}`}>
                  <Flame size={15} aria-hidden className={stats.current ? "text-orange-500" : "text-[var(--muted-foreground)]"} />
                  <span className="font-semibold">{stats.current}</span>
                  <span className="text-xs text-[var(--muted-foreground)]">· best {stats.best}</span>
                </p>
              </div>
              <ol className="mt-3 flex gap-1" aria-label="Recent">
                {recent.map((h) => (
                  <li key={h.id} title={`${h.dueAt ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(h.dueAt)) : "No date"}: ${STATE_LABEL[h.state]}`}
                    className={`size-4 rounded-sm ${STATE_STYLE[h.state]}`}>
                    <span className="sr-only">{STATE_LABEL[h.state]}</span>
                  </li>
                ))}
              </ol>
              {canWrite && open ? (
                <button type="button" disabled={done.isPending} onClick={() => done.mutate(task.id)}
                  className="mt-3 h-9 rounded-lg bg-[var(--accent)] px-3 text-sm text-[var(--accent-ink)] disabled:opacity-50">
                  Done{task.dueAt ? ` · due ${new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(new Date(task.dueAt))}` : ""}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
