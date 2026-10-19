"use client";

import { useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";
import { hoursLabel } from "@/src/core/capacity";
import { countByDay, countByWeek, daysAgo, minutesBetween, onTimeRate, overdueCount, weekStart } from "@/src/core/stats";
import { ColumnChart, type Column } from "@/src/features/stats/ColumnChart";

const noSubscribe = () => () => {};
const DAYS = 14;
const WEEKS = 12;

/** /w/:id/stats — your own throughput and timeliness in this workspace. */
export function StatsView({ workspaceId }: { workspaceId: string }) {
  // Everything is counted in the viewer's days.
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  if (!mounted) return <p className="text-sm text-[var(--muted-foreground)]">Loading stats…</p>;
  return <Stats workspaceId={workspaceId} />;
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="h-full rounded-[var(--r-lg)] border border-[var(--hairline)] bg-[var(--surface)] p-4">
      <p className="text-xs text-[var(--muted-foreground)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--foreground)]">{value}</p>
      {note ? <p className="mt-1 text-xs text-[var(--muted-foreground)]">{note}</p> : null}
    </div>
  );
}

function Stats({ workspaceId }: { workspaceId: string }) {
  const [now] = useState(() => new Date());
  const thisWeek = weekStart(now);
  const firstWeek = daysAgo(thisWeek, 7 * (WEEKS - 1));
  const stats = useQuery({
    queryKey: ["stats", workspaceId, firstWeek.toISOString()],
    queryFn: () => api.myStats(workspaceId, firstWeek.toISOString()),
  });
  if (stats.isPending) return <p className="text-sm text-[var(--muted-foreground)]">Loading stats…</p>;
  if (stats.isError) return <p role="alert" className="text-sm">Could not load stats. <button type="button" className="underline" onClick={() => void stats.refetch()}>Retry</button></p>;

  const { completed, open, time } = stats.data;
  const doneAt = completed.map((row) => row.completedAt);
  const days = Array.from({ length: DAYS }, (_, i) => daysAgo(now, DAYS - 1 - i));
  const weeks = Array.from({ length: WEEKS }, (_, i) => daysAgo(thisWeek, 7 * (WEEKS - 1 - i)));
  const perDay = countByDay(doneAt, days);
  const perWeek = countByWeek(doneAt, weeks);
  const weekDone = perWeek[WEEKS - 1] ?? 0;
  const lastWeekDone = perWeek[WEEKS - 2] ?? 0;
  const thirty = daysAgo(now, 29);
  const timely = onTimeRate(completed.filter((row) => Date.parse(row.completedAt) >= thirty.getTime()));
  const tracked = minutesBetween(time, thisWeek, daysAgo(thisWeek, -7));
  const fmt = (date: Date, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(undefined, options).format(date);
  const delta = weekDone - lastWeekDone;

  const dayColumns: Column[] = days.map((day, i) => ({
    key: day.toISOString(), label: fmt(day, { day: "numeric" }), value: perDay[i]!,
    detail: fmt(day, { weekday: "short", month: "short", day: "numeric" }),
  }));
  const weekColumns: Column[] = weeks.map((monday, i) => ({
    key: monday.toISOString(), label: fmt(monday, { month: "short", day: "numeric" }), value: perWeek[i]!,
    detail: `Week of ${fmt(monday, { month: "short", day: "numeric" })}`,
  }));

  return (
    <section className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Your stats</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">Tasks assigned to you, or unassigned ones you created, in this workspace.</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="list" aria-label="Summary">
        <div role="listitem"><Tile label="Completed this week" value={String(weekDone)}
          note={delta ? `${delta > 0 ? "+" : "−"}${Math.abs(delta)} vs last week` : "Same as last week"} /></div>
        <div role="listitem"><Tile label="On time, last 30 days" value={timely.rate === null ? "—" : `${Math.round(timely.rate * 100)}%`}
          note={timely.total ? `${timely.onTime} of ${timely.total} dated tasks done by their due date` : "No dated tasks finished yet"} /></div>
        <div role="listitem"><Tile label="Overdue now" value={String(overdueCount(open, now))} note="Open tasks past their due date" /></div>
        <div role="listitem"><Tile label="Tracked this week" value={hoursLabel(tracked)} note="From the time you logged" /></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ColumnChart title={`Completed per day, last ${DAYS} days`} columns={dayColumns} unit="completed" />
        <ColumnChart title={`Completed per week, last ${WEEKS} weeks`} columns={weekColumns} unit="completed" />
      </div>
    </section>
  );
}
