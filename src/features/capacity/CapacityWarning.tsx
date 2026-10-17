"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { capacityOf, dayKey, hoursLabel, overBy, workload } from "@/src/core/capacity";
import { endOfDay, startOfDay } from "@/src/features/task/dates";

/**
 * Under the drawer's assignees: says when the task's due day is more than an
 * assignee has hours for. Silent when it fits, or the task has no due date or assignee.
 */
export function CapacityWarning({ workspaceId, dueAt, assigneeIds }: {
  workspaceId: string;
  dueAt: string | null;
  assigneeIds: string[];
}) {
  const day = dueAt ? startOfDay(new Date(dueAt)) : null;
  const range = day ? { dueAfter: day.toISOString(), dueBefore: endOfDay(day).toISOString() } : null;
  const enabled = Boolean(range && assigneeIds.length);
  const tasks = useQuery({
    queryKey: qk.tasks(workspaceId, { view: "capacity-day", status: "todo,in_progress", ...(range ?? {}) }),
    queryFn: () => api.listTasks(workspaceId, { status: "todo,in_progress", ...range! }),
    enabled,
  });
  const members = useQuery({ queryKey: qk.members(workspaceId), queryFn: () => api.listMembers(workspaceId), enabled });
  if (!enabled || !day || !tasks.data || !members.data) return null;

  const load = workload(tasks.data.tasks, assigneeIds, [day]);
  const lines = assigneeIds.flatMap((userId) => {
    const member = members.data.members.find((m) => m.userId === userId);
    const cell = load.get(userId)?.get(dayKey(day));
    if (!member || !cell) return [];
    const capacity = capacityOf(member.capacityMinutes);
    const over = overBy(cell, capacity, day);
    return over ? [`${member.displayName} has ${hoursLabel(cell.minutes)} due ${new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(day)}, over their ${hoursLabel(capacity[day.getDay()] ?? 0)} by ${hoursLabel(over)}.`] : [];
  });
  if (!lines.length) return null;
  return (
    <div role="status" className="mt-2 space-y-1 rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-700 dark:text-red-300">
      {lines.map((line) => <p key={line}>⚠ {line}</p>)}
    </div>
  );
}
