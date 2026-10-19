"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";
import { percent, type GoalState, type Progress } from "@/src/core/goals";

export const goalsKey = (workspaceId: string) => ["goals", workspaceId] as const;

export function useGoals(workspaceId: string) {
  return useQuery({ queryKey: goalsKey(workspaceId), queryFn: () => api.listGoals(workspaceId), staleTime: 30_000 });
}

/** "3 of 8 tasks" with a thin bar; the bar is decorative, the text carries the number. */
export function ProgressBar({ progress, label }: { progress: Progress; label: string }) {
  const value = percent(progress);
  return (
    <div className="space-y-1">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-valuetext={`${progress.done} of ${progress.total} tasks done`}
        className="h-1.5 overflow-hidden rounded-full bg-[var(--hairline)]"
      >
        <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${value}%` }} />
      </div>
      <p className="text-xs tabular-nums text-[var(--muted-foreground)]">
        {progress.total ? `${progress.done} of ${progress.total} tasks · ${value}%` : "No tasks yet"}
      </p>
    </div>
  );
}

const STATE_LABEL: Record<GoalState, string | null> = { done: "Done", overdue: "Overdue", open: null, empty: null };

export function StateChip({ state }: { state: GoalState }) {
  const label = STATE_LABEL[state];
  if (!label) return null;
  return (
    <span className={`font-mono text-[11px] uppercase tracking-wide ${state === "overdue" ? "text-[var(--accent)]" : "text-[var(--muted-foreground)]"}`}>
      {label}
    </span>
  );
}

/** Goal and milestone pickers for a task; the milestone list follows the goal. */
export function GoalSelect({ workspaceId, goalId, milestoneId, onChange, disabled = false, className, labelClassName }: {
  workspaceId: string;
  goalId: string | null;
  milestoneId: string | null;
  onChange: (next: { goalId: string | null; milestoneId: string | null }) => void;
  disabled?: boolean;
  className?: string;
  labelClassName?: string;
}) {
  const goals = useGoals(workspaceId).data?.goals ?? [];
  // Archived goals stay pickable only for the task already on one.
  const choices = goals.filter((goal) => !goal.archived || goal.id === goalId);
  if (!choices.length) return null;
  const goal = goals.find((item) => item.id === goalId);
  return (
    <>
      <label className={labelClassName}>
        <span>Goal</span>
        <select aria-label="Goal" value={goalId ?? ""} disabled={disabled} className={className}
          onChange={(event) => onChange({ goalId: event.target.value || null, milestoneId: null })}>
          <option value="">No goal</option>
          {choices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      {goal?.milestones.length ? (
        <label className={labelClassName}>
          <span>Milestone</span>
          <select aria-label="Milestone" value={milestoneId ?? ""} disabled={disabled} className={className}
            onChange={(event) => onChange({ goalId, milestoneId: event.target.value || null })}>
            <option value="">No milestone</option>
            {goal.milestones.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.name}</option>)}
          </select>
        </label>
      ) : null}
    </>
  );
}
