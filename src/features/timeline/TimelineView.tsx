"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { dropToIso } from "@/src/features/timeline/drag";
import { useTimelineDrag, withPreview, type DragPreview } from "@/src/features/timeline/use-timeline-drag";
import type { Task } from "@/src/core/sync/types";

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

  // Open tasks without a time, to drag onto the grid.
  const [scheduleSearch, setScheduleSearch] = useState("");
  const unscheduledQuery = useQuery({
    queryKey: qk.tasks(workspaceId, { view: "to-schedule", status: "todo,in_progress" }),
    queryFn: () => api.listTasks(workspaceId, { status: "todo,in_progress" }),
    staleTime: 30_000,
  });
  const needle = scheduleSearch.trim().toLowerCase();
  const toSchedule = (unscheduledQuery.data?.tasks ?? [])
    .filter((task) => !task.dueHasTime && (!needle || task.title.toLowerCase().includes(needle)))
    .sort((a, b) => (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity))
    .slice(0, 30);

  // Dropping saves the new time (move, place) or duration (resize), shown at once.
  const [dropError, setDropError] = useState<string | null>(null);
  const reschedule = useMutation({
    mutationFn: (drop: DragPreview) => api.updateTask(drop.task.id, drop.kind === "resize"
      ? { durationMinutes: drop.end - drop.start }
      : { dueAt: dropToIso(drop.day, drop.start), dueHasTime: true }),
    onMutate: async (drop) => {
      setDropError(null);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<{ tasks: Task[] }>(queryKey);
      queryClient.setQueryData<{ tasks: Task[] }>(queryKey, (old) => ({ tasks: withPreview(old?.tasks ?? [], drop) }));
      return { previous };
    },
    onError: (err: Error, _drop, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      setDropError(err.message);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["tasks", workspaceId] }),
  });
  const { preview, begin, dragged } = useTimelineDrag({ hourPx: HOUR_PX, days, onDrop: (drop) => reschedule.mutate(drop) });
  const shown = withPreview(tasks, preview);
  const open = (task: Task) => {
    if (dragged.current) return;
    seedTaskCache(queryClient, task);
    openTaskInDrawer(task.id);
  };

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
      {dropError ? <p role="alert" className="text-sm text-[var(--accent)]">{dropError}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
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
                          onClick={() => open(task)}
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
                const blocks = layoutDay(shown, day);
                const today = sameDay(day, now);
                return (
                  <div key={day.toISOString()} data-timeline-day={day.toISOString()} className="relative border-l border-[var(--hairline)]"
                    style={{ backgroundImage: `repeating-linear-gradient(to bottom, var(--hairline) 0 1px, transparent 1px ${HOUR_PX}px)` }}>
                    {blocks.map(({ task, start, end, lane, lanes }) => (
                      <button key={task.id} type="button"
                        title={`${formatTime(task.dueAt!)} · ${task.title} — drag to move, or drag the bottom edge to change how long it takes`}
                        onClick={() => open(task)}
                        onPointerDown={(event) => begin(event, task, "move", { day, start })}
                        className={`absolute cursor-grab touch-none select-none overflow-hidden rounded-md border px-1.5 py-0.5 text-left text-[11px] leading-tight transition-colors hover:border-[var(--accent)] ${preview?.task.id === task.id ? "z-20 shadow-lg ring-2 ring-[var(--accent)] " : ""}${
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
                        {/* The bottom edge resizes. */}
                        <span aria-hidden onPointerDown={(event) => begin(event, task, "resize", { day, start })}
                          className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize touch-none" />
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

      <aside aria-label="To schedule" className="rounded-[var(--r-lg)] border border-[var(--hairline)] bg-[var(--surface)] p-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">To schedule</h2>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">Drag a task onto the timeline to give it a time.</p>
        <input value={scheduleSearch} onChange={(event) => setScheduleSearch(event.target.value)} aria-label="Find a task to schedule"
          placeholder="Search…" className="mt-2 h-8 w-full rounded-lg border border-[var(--hairline)] bg-[var(--bg)] px-2 text-xs text-[var(--foreground)]" />
        <ul className="mt-2 max-h-[60vh] space-y-1 overflow-y-auto" data-lenis-prevent>
          {toSchedule.map((task) => (
            <li key={task.id}>
              <button type="button" title="Drag onto the timeline, or click to open"
                onClick={() => open(task)}
                onPointerDown={(event) => begin(event, task, "place")}
                className={`w-full cursor-grab touch-none select-none truncate rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] px-2 py-1.5 text-left text-xs text-[var(--foreground)] hover:border-[var(--accent)] ${preview?.task.id === task.id ? "opacity-50" : ""}`}>
                {task.title}
                {task.dueAt ? <span className="block text-[10px] text-[var(--muted-foreground)]">Due {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(task.dueAt))}</span> : null}
              </button>
            </li>
          ))}
          {unscheduledQuery.data && !toSchedule.length ? <li className="text-xs text-[var(--muted-foreground)]">Nothing waiting for a time.</li> : null}
        </ul>
      </aside>
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
