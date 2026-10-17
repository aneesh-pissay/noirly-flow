"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { formatDuration, formatTime } from "@/src/features/task/dates";
import { priorityDotClassName } from "@/src/features/task/priority";
import { TaskDrawer } from "@/src/features/task/TaskDrawer";
import { openTaskInDrawer } from "@/src/features/task/TaskSubtasks";
import { seedTaskCache } from "@/src/features/task/task-cache";
import {
  addDays, allDayTasks, layoutDay, sameDay, startOfLocalDay, visibleDays, visibleRange,
  type TimelineMode,
} from "@/src/features/timeline/layout";

/** Pixels per hour on the grid. */
const HOUR_PX = 48;
/** Hour the grid opens scrolled to. */
const FIRST_HOUR = 7;
const STATUSES = "todo,in_progress,done";

/** The current minute, re-read every 30 seconds for the "now" line. */
function useNowMinute() {
  return useSyncExternalStore(
    (notify) => { const timer = window.setInterval(notify, 30_000); return () => window.clearInterval(timer); },
    () => Math.floor(Date.now() / 60_000),
    () => 0,
  );
}

/**
 * Day or week, hour by hour, across every project and the Inbox. Timed tasks
 * are blocks from their due time for their duration (30 minutes if unset);
 * all-day tasks sit in a strip on top. Done tasks stay, struck through.
 */
export function TimelineView({ workspaceId }: { workspaceId: string }) {
  // Days and times are the browser's; the server renders in its own zone and locale.
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  if (!mounted) return <p className="text-sm text-[var(--muted-foreground)]">Loading timeline…</p>;
  return <Timeline workspaceId={workspaceId} />;
}

const noSubscribe = () => () => {};

function Timeline({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<TimelineMode>("week");
  const [anchor, setAnchor] = useState(() => startOfLocalDay(new Date()));
  const days = visibleDays(mode, anchor);
  const range = visibleRange(days);
  const queryKey = qk.tasks(workspaceId, { view: "timeline", status: STATUSES, ...range });
  const tasksQuery = useQuery({
    queryKey,
    queryFn: () => api.listTasks(workspaceId, { status: STATUSES, ...range }),
    refetchInterval: 60_000,
  });
  const tasks = tasksQuery.data?.tasks ?? [];
  const nowMinute = useNowMinute();
  const now = new Date(nowMinute * 60_000);

  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (grid.current) grid.current.scrollTop = FIRST_HOUR * HOUR_PX;
  }, []);

  // ?task= opens the drawer, as on the other task pages.
  const urlTaskId = useSearchParams().get("task");
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(urlTaskId);
  const [seenUrlTaskId, setSeenUrlTaskId] = useState(urlTaskId);
  if (urlTaskId !== seenUrlTaskId) {
    setSeenUrlTaskId(urlTaskId);
    setDrawerTaskId(urlTaskId);
  }

  const step = mode === "day" ? 1 : 7;
  const rangeLabel = mode === "day"
    ? new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(days[0])
    : `${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(days[0])} – ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(days[6])}`;
  const columns = `3rem repeat(${days.length}, minmax(0, 1fr))`;
  const toggleClass = (on: boolean) => `rounded-xl px-3 py-1.5 text-sm ${on ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "border border-[var(--hairline)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`;

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">Timeline</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">{rangeLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" aria-pressed={mode === "day"} onClick={() => setMode("day")} className={toggleClass(mode === "day")}>Day</button>
          <button type="button" aria-pressed={mode === "week"} onClick={() => setMode("week")} className={toggleClass(mode === "week")}>Week</button>
          <button type="button" aria-label={mode === "day" ? "Previous day" : "Previous week"} onClick={() => setAnchor((d) => addDays(d, -step))}
            className="grid size-9 place-items-center rounded-xl border border-[var(--hairline)]"><ChevronLeft size={16} aria-hidden /></button>
          <button type="button" onClick={() => setAnchor(startOfLocalDay(new Date()))} className="rounded-xl border border-[var(--hairline)] px-3 py-1.5 text-sm">Today</button>
          <button type="button" aria-label={mode === "day" ? "Next day" : "Next week"} onClick={() => setAnchor((d) => addDays(d, step))}
            className="grid size-9 place-items-center rounded-xl border border-[var(--hairline)]"><ChevronRight size={16} aria-hidden /></button>
        </div>
      </header>

      {tasksQuery.isError ? <p role="alert" className="text-sm">Could not load tasks. <button type="button" className="underline" onClick={() => void tasksQuery.refetch()}>Retry</button></p> : null}

      <div className="overflow-x-auto rounded-[var(--r-lg)] border border-[var(--hairline)] bg-[var(--surface)]">
        <div className={mode === "week" ? "min-w-[44rem]" : undefined}>
          {/* Day headings and the all-day strip. */}
          <div className="grid border-b border-[var(--hairline)]" style={{ gridTemplateColumns: columns }}>
            <div />
            {days.map((day) => {
              const today = sameDay(day, now);
              const allDay = allDayTasks(tasks, day);
              return (
                <div key={day.toISOString()} role="group" aria-label={new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(day)}
                  className="min-w-0 border-l border-[var(--hairline)] p-1.5">
                  <p className={`text-center font-mono text-[11px] uppercase tracking-wide ${today ? "text-[var(--accent)]" : "text-[var(--muted-foreground)]"}`}>
                    {new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric" }).format(day)}
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {allDay.map((task) => (
                      <li key={task.id}>
                        <button type="button" title={task.title}
                          onClick={() => { seedTaskCache(queryClient, task); openTaskInDrawer(task.id); }}
                          className={`w-full truncate rounded border border-[var(--hairline)] bg-[var(--surface-2)] px-1 text-left text-[11px] ${task.status === "done" ? "text-[var(--muted-foreground)] line-through" : "text-[var(--foreground)]"}`}>
                          {task.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {/* The hours. */}
          <div ref={grid} className="max-h-[70vh] overflow-y-auto" data-lenis-prevent>
            <div className="relative grid" style={{ gridTemplateColumns: columns, height: 24 * HOUR_PX }}>
              <div className="relative">
                {Array.from({ length: 24 }, (_, hour) => (
                  <span key={hour} className="absolute right-1.5 -translate-y-1/2 font-mono text-[10px] text-[var(--muted-foreground)]" style={{ top: hour * HOUR_PX }}>
                    {hour ? new Intl.DateTimeFormat(undefined, { hour: "numeric" }).format(new Date(2000, 0, 1, hour)) : ""}
                  </span>
                ))}
              </div>
              {days.map((day) => {
                const blocks = layoutDay(tasks, day);
                const today = sameDay(day, now);
                return (
                  <div key={day.toISOString()} className="relative border-l border-[var(--hairline)]"
                    style={{ backgroundImage: `repeating-linear-gradient(to bottom, var(--hairline) 0 1px, transparent 1px ${HOUR_PX}px)` }}>
                    {blocks.map(({ task, start, end, lane, lanes }) => (
                      <button key={task.id} type="button"
                        title={`${formatTime(task.dueAt!)} · ${task.title}`}
                        onClick={() => { seedTaskCache(queryClient, task); openTaskInDrawer(task.id); }}
                        className={`absolute overflow-hidden rounded-md border px-1.5 py-0.5 text-left text-[11px] leading-tight transition-colors hover:border-[var(--accent)] ${
                          task.status === "done" ? "border-[var(--hairline)] bg-[var(--surface-2)] text-[var(--muted-foreground)] line-through" : "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--foreground)]"}`}
                        style={{
                          top: (start / 60) * HOUR_PX + 1,
                          height: Math.max(18, ((end - start) / 60) * HOUR_PX - 2),
                          left: `calc(${(lane / lanes) * 100}% + 2px)`,
                          width: `calc(${100 / lanes}% - 4px)`,
                        }}>
                        <span className="flex items-center gap-1">
                          <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${priorityDotClassName(task.priority)}`} />
                          {task.blocked ? <Lock size={10} aria-label="Blocked" /> : null}
                          <span className="truncate font-medium">{task.title}</span>
                        </span>
                        <span className="block truncate text-[10px] text-[var(--muted-foreground)]">
                          {formatTime(task.dueAt!)}{task.durationMinutes ? ` · ${formatDuration(task.durationMinutes)}` : ""}
                        </span>
                      </button>
                    ))}
                    {today ? (
                      <div aria-hidden className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-[var(--accent)]"
                        style={{ top: ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_PX }} />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      {tasksQuery.data && !tasks.length ? (
        <p className="text-sm text-[var(--muted-foreground)]">Nothing due {mode === "day" ? "this day" : "this week"}. Give tasks a due time to see them here.</p>
      ) : null}

      {drawerTaskId ? (
        <TaskDrawer key={drawerTaskId} workspaceId={workspaceId} taskId={drawerTaskId}
          initialTask={tasks.find((task) => task.id === drawerTaskId)}
          onClose={() => {
            setDrawerTaskId(null);
            const url = new URL(window.location.href);
            url.searchParams.delete("task");
            window.history.pushState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
            void queryClient.invalidateQueries({ queryKey: ["tasks", workspaceId] });
          }} />
      ) : null}
    </section>
  );
}
