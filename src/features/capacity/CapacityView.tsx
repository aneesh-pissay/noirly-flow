"use client";

import { useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { capacityOf, dayKey, hoursLabel, overBy, workload } from "@/src/core/capacity";
import { useCan } from "@/src/features/workspace/WorkspaceRoleContext";
import { openTaskInDrawer } from "@/src/features/task/TaskSubtasks";
import { addDays, startOfLocalDay, visibleDays, visibleRange } from "@/src/features/timeline/layout";

const OPEN = "todo,in_progress";
/** Editor order: Monday first; capacity arrays are Sunday first. */
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const noSubscribe = () => () => {};

/** /w/:id/capacity — each person's booked hours against their available hours, day by day. */
export function CapacityView({ workspaceId }: { workspaceId: string }) {
  // Days are the browser's; the server renders in its own zone and locale.
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  if (!mounted) return <p className="text-sm text-[var(--muted-foreground)]">Loading capacity…</p>;
  return <Capacity workspaceId={workspaceId} />;
}

function Capacity({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const canManage = useCan("members.manage");
  const [anchor, setAnchor] = useState(() => startOfLocalDay(new Date()));
  const days = visibleDays("week", anchor);
  const range = visibleRange(days);
  const members = useQuery({ queryKey: qk.members(workspaceId), queryFn: () => api.listMembers(workspaceId) });
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.me() });
  const tasks = useQuery({
    queryKey: qk.tasks(workspaceId, { view: "capacity", status: OPEN, ...range }),
    queryFn: () => api.listTasks(workspaceId, { status: OPEN, ...range }),
  });
  const people = members.data?.members ?? [];
  const load = workload(tasks.data?.tasks ?? [], people.map((p) => p.userId), days);
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState<{ userId: string; day: string } | null>(null);
  const format = (day: Date, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(undefined, options).format(day);

  const saveHours = useMutation({
    mutationFn: ({ userId, minutes }: { userId: string; minutes: number[] }) => api.setMemberCapacity(workspaceId, userId, minutes),
    onSuccess: () => { setEditing(null); void queryClient.invalidateQueries({ queryKey: qk.members(workspaceId) }); },
  });

  const selected = open ? load.get(open.userId)?.get(open.day) : null;

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">Capacity</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Open work due each day (task durations) against each person&apos;s hours. {format(days[0]!, { month: "short", day: "numeric" })} – {format(days[6]!, { month: "short", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Previous week" onClick={() => setAnchor((d) => addDays(d, -7))} className="grid size-9 place-items-center rounded-xl border border-[var(--hairline)]"><ChevronLeft size={16} aria-hidden /></button>
          <button type="button" onClick={() => setAnchor(startOfLocalDay(new Date()))} className="rounded-xl border border-[var(--hairline)] px-3 py-1.5 text-sm">This week</button>
          <button type="button" aria-label="Next week" onClick={() => setAnchor((d) => addDays(d, 7))} className="grid size-9 place-items-center rounded-xl border border-[var(--hairline)]"><ChevronRight size={16} aria-hidden /></button>
        </div>
      </header>

      {saveHours.isError ? <p role="alert" className="text-sm text-[var(--accent)]">{(saveHours.error as Error).message}</p> : null}

      <div className="overflow-x-auto rounded-[var(--r-lg)] border border-[var(--hairline)] bg-[var(--surface)]">
        <table className="w-full min-w-[44rem] text-sm">
          <thead>
            <tr className="border-b border-[var(--hairline)]">
              <th scope="col" className="p-2 text-left font-mono text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">Person</th>
              {days.map((day) => (
                <th key={dayKey(day)} scope="col" className="p-2 text-center font-mono text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
                  {format(day, { weekday: "short", day: "numeric" })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((person) => {
              const capacity = capacityOf(person.capacityMinutes);
              const canEdit = person.userId === me.data?.user.id || canManage;
              return (
                <tr key={person.userId} className="border-b border-dashed border-[var(--hairline)] align-top">
                  <th scope="row" className="p-2 text-left font-normal">
                    <span className="block text-[var(--foreground)]">{person.displayName}</span>
                    {canEdit ? (
                      <button type="button" onClick={() => setEditing(editing === person.userId ? null : person.userId)}
                        className="text-xs text-[var(--muted-foreground)] underline-offset-2 hover:underline">
                        {editing === person.userId ? "Close" : person.userId === me.data?.user.id ? "My hours" : "Hours"}
                      </button>
                    ) : null}
                  </th>
                  {days.map((day) => {
                    const cell = load.get(person.userId)?.get(dayKey(day)) ?? { minutes: 0, unestimated: 0, tasks: [] };
                    const hours = capacity[day.getDay()] ?? 0;
                    const over = overBy(cell, capacity, day);
                    const percent = hours ? Math.min(100, (cell.minutes / hours) * 100) : cell.minutes ? 100 : 0;
                    const label = `${person.displayName}, ${format(day, { weekday: "long" })}: ${hoursLabel(cell.minutes)} of ${hoursLabel(hours)}${over ? `, over by ${hoursLabel(over)}` : ""}`;
                    return (
                      <td key={dayKey(day)} className="p-1.5">
                        <button type="button" aria-label={label} disabled={!cell.tasks.length}
                          aria-expanded={open?.userId === person.userId && open.day === dayKey(day)}
                          onClick={() => setOpen(open?.userId === person.userId && open.day === dayKey(day) ? null : { userId: person.userId, day: dayKey(day) })}
                          className={`w-full rounded-lg border p-1.5 text-center ${over ? "border-red-500/60 bg-red-500/10" : "border-[var(--hairline)]"} disabled:cursor-default`}>
                          <span className={`block text-xs ${over ? "font-medium text-red-600 dark:text-red-400" : "text-[var(--foreground)]"}`}>
                            {hoursLabel(cell.minutes)} <span className="text-[var(--muted-foreground)]">/ {hoursLabel(hours)}</span>
                          </span>
                          <span aria-hidden className="mt-1 block h-1 overflow-hidden rounded bg-[var(--surface-2)]">
                            <span className={`block h-full ${over ? "bg-red-500" : "bg-[var(--accent)]"}`} style={{ width: `${percent}%` }} />
                          </span>
                          {over ? <span className="mt-0.5 block text-[10px] text-red-600 dark:text-red-400">Over {hoursLabel(over)}</span> : null}
                          {cell.unestimated ? <span className="mt-0.5 block text-[10px] text-[var(--muted-foreground)]">+{cell.unestimated} unestimated</span> : null}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {open && selected ? (
        <div role="region" aria-label="Tasks that day" className="rounded-[var(--r-lg)] border border-[var(--hairline)] bg-[var(--surface)] p-4">
          <h2 className="mb-2 text-sm font-medium text-[var(--foreground)]">
            {people.find((p) => p.userId === open.userId)?.displayName} · {format(days.find((d) => dayKey(d) === open.day)!, { weekday: "long", month: "short", day: "numeric" })}
          </h2>
          <ul className="space-y-1">
            {selected.tasks.map((task) => (
              <li key={task.id} className="flex justify-between gap-2 text-sm">
                <button type="button" onClick={() => openTaskInDrawer(task.id)} className="truncate text-left text-[var(--foreground)] hover:underline">{task.title}</button>
                <span className="shrink-0 font-mono text-xs text-[var(--muted-foreground)]">{task.durationMinutes ? hoursLabel(task.durationMinutes) : "no estimate"}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {editing ? (
        <HoursEditor key={editing}
          name={people.find((p) => p.userId === editing)?.displayName ?? ""}
          minutes={capacityOf(people.find((p) => p.userId === editing)?.capacityMinutes)}
          pending={saveHours.isPending}
          onSave={(minutes) => saveHours.mutate({ userId: editing, minutes })}
          onCancel={() => setEditing(null)} />
      ) : null}
    </section>
  );
}

function HoursEditor({ name, minutes, pending, onSave, onCancel }: {
  name: string;
  minutes: number[];
  pending: boolean;
  onSave: (minutes: number[]) => void;
  onCancel: () => void;
}) {
  const [hours, setHours] = useState(() => minutes.map((m) => String(m / 60)));
  const dayName = (weekday: number) => new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(new Date(2026, 7, 2 + weekday));
  return (
    <form role="region" aria-label={`Hours for ${name}`} className="rounded-[var(--r-lg)] border border-[var(--hairline)] bg-[var(--surface)] p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(hours.map((h) => Math.round(Math.min(24, Math.max(0, Number(h) || 0)) * 60)));
      }}>
      <h2 className="mb-3 text-sm font-medium text-[var(--foreground)]">Hours for {name}</h2>
      <div className="flex flex-wrap gap-3">
        {WEEK.map((weekday) => (
          <label key={weekday} className="flex flex-col text-xs text-[var(--muted-foreground)]">
            {dayName(weekday)}
            <input type="number" min={0} max={24} step={0.5} value={hours[weekday]} aria-label={`${dayName(weekday)} hours`}
              onChange={(event) => setHours((list) => list.map((h, i) => (i === weekday ? event.target.value : h)))}
              className="mt-1 h-9 w-16 rounded-lg border border-[var(--hairline)] bg-[var(--bg)] px-2 text-sm text-[var(--foreground)]" />
          </label>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={pending} className="h-9 rounded-lg bg-[var(--accent)] px-3 text-sm text-[var(--accent-ink)] disabled:opacity-50">{pending ? "Saving…" : "Save hours"}</button>
        <button type="button" onClick={onCancel} className="h-9 px-2 text-sm text-[var(--muted-foreground)]">Cancel</button>
      </div>
    </form>
  );
}
