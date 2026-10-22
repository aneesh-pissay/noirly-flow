"use client";

import { useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { Lock } from "lucide-react";
import type { Task } from "@/src/core/sync/types";
import {
  dayDate, dayNumber, ganttBars, ganttLinks, ganttPatch, ganttRange,
  type GanttBar, type GanttDrag,
} from "@/src/features/gantt/layout";

/** Pixels per day and per row. */
const DAY_PX = 28;
const ROW_PX = 34;
const DRAG_THRESHOLD = 4;

type Preview = { taskId: string; kind: GanttDrag; delta: number };

/** Where a bar is drawn while being dragged. */
function shown(bar: GanttBar, preview: Preview | null) {
  if (!preview || preview.taskId !== bar.task.id) return bar;
  const { kind, delta } = preview;
  if (kind === "move") return { ...bar, start: bar.start + delta, end: bar.end + delta };
  if (kind === "start") return { ...bar, start: Math.min(bar.start + delta, bar.end) };
  return { ...bar, end: Math.max(bar.end + delta, bar.start) };
}

const noSubscribe = () => () => {};

/**
 * A project's dated tasks as bars from start to due date, with "blocked by"
 * arrows, deadline marks and a line for today. Drag a bar to shift its dates,
 * or an end to change one of them; whole days, keeping any due time.
 */
export function GanttView({ tasks, canWrite, onOpenTask, onPatch }: {
  tasks: Task[];
  canWrite: boolean;
  onOpenTask: (taskId: string) => void;
  onPatch: (taskId: string, patch: Partial<Task>) => void;
}) {
  // Today is the browser's day.
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const dragged = useRef(false);
  if (!mounted) return <p className="text-sm text-[var(--muted-foreground)]">Loading…</p>;

  const live = tasks.filter((task) => task.status !== "canceled");
  const bars = ganttBars(live);
  const undated = live.filter((task) => !task.startAt && !task.dueAt);
  const today = dayNumber(new Date());
  const { first, days } = ganttRange(bars, today);
  const links = ganttLinks(bars);
  const width = days * DAY_PX;

  function begin(event: ReactPointerEvent, bar: GanttBar, kind: GanttDrag) {
    if (!canWrite || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    let moved = false;
    let delta = 0;
    const onMove = (e: PointerEvent) => {
      if (!moved && Math.abs(e.clientX - startX) < DRAG_THRESHOLD) return;
      moved = true;
      delta = Math.round((e.clientX - startX) / DAY_PX);
      setPreview({ taskId: bar.task.id, kind, delta });
    };
    const finish = (commit: boolean) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      setPreview(null);
      if (moved) {
        dragged.current = true;
        window.setTimeout(() => { dragged.current = false; }, 0);
      }
      if (commit && moved && delta) onPatch(bar.task.id, ganttPatch(bar, kind, delta));
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

  const dayLabel = (day: number) => dayDate(day).getDate();
  const monthLabel = (day: number) => new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(dayDate(day));
  const weekend = (day: number) => [0, 6].includes(dayDate(day).getDay());

  return (
    <div className="flex flex-col gap-4">
      {bars.length ? (
        <div className="overflow-x-auto rounded-[var(--r-lg)] border border-[var(--hairline)] bg-[var(--surface)]" data-lenis-prevent>
          <div className="relative flex" style={{ width: `calc(12rem + ${width}px)` }}>
            {/* Task names, kept in view while scrolling sideways. */}
            <div className="sticky left-0 z-20 w-48 shrink-0 border-r border-[var(--hairline)] bg-[var(--surface)]">
              <div className="h-10 border-b border-[var(--hairline)]" />
              {bars.map((bar) => (
                <div key={bar.task.id} className="flex items-center gap-1 truncate border-b border-dashed border-[var(--hairline)] px-2 text-xs" style={{ height: ROW_PX }}>
                  {bar.task.blocked ? <Lock size={11} aria-label="Blocked" className="shrink-0 text-[var(--accent)]" /> : null}
                  <button type="button" onClick={() => onOpenTask(bar.task.id)}
                    className={`truncate text-left hover:underline ${bar.task.status === "done" ? "text-[var(--muted-foreground)] line-through" : "text-[var(--foreground)]"}`}>
                    {bar.task.title}
                  </button>
                </div>
              ))}
            </div>

            <div className="relative" style={{ width }}>
              {/* Days. */}
              <div className="flex h-10 border-b border-[var(--hairline)]">
                {Array.from({ length: days }, (_, i) => first + i).map((day) => (
                  <div key={day} className={`relative shrink-0 border-l border-[var(--hairline)] text-center font-mono text-[10px] ${day === today ? "text-[var(--accent)]" : "text-[var(--muted-foreground)]"} ${weekend(day) ? "bg-[var(--surface-2)]" : ""}`}
                    style={{ width: DAY_PX }}>
                    {dayLabel(day) === 1 || day === first ? <span className="absolute left-1 top-0.5 whitespace-nowrap text-[9px] uppercase">{monthLabel(day)}</span> : null}
                    <span className="absolute inset-x-0 bottom-1">{dayLabel(day)}</span>
                  </div>
                ))}
              </div>

              <div className="relative" style={{ height: bars.length * ROW_PX }}>
                {/* Weekends and today. */}
                {Array.from({ length: days }, (_, i) => first + i).filter(weekend).map((day) => (
                  <div key={day} aria-hidden className="absolute inset-y-0 bg-[var(--surface-2)]" style={{ left: (day - first) * DAY_PX, width: DAY_PX }} />
                ))}
                <div aria-hidden className="absolute inset-y-0 z-10 w-0.5 bg-[var(--accent)]" style={{ left: (today - first) * DAY_PX + DAY_PX / 2 }} />

                {/* Blocked-by arrows. */}
                <svg aria-hidden className="pointer-events-none absolute inset-0 z-10 text-[var(--muted-foreground)]" width={width} height={bars.length * ROW_PX}>
                  <defs>
                    <marker id="gantt-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto">
                      <path d="M0,0 L6,3 L0,6 z" fill="currentColor" />
                    </marker>
                  </defs>
                  {links.map(({ from, to }) => {
                    const a = shown(bars[from]!, preview);
                    const b = shown(bars[to]!, preview);
                    const x1 = (a.end - first + 1) * DAY_PX - 2;
                    const y1 = from * ROW_PX + ROW_PX / 2;
                    const x2 = (b.start - first) * DAY_PX + 2;
                    const y2 = to * ROW_PX + ROW_PX / 2;
                    const d = x2 >= x1 + 12
                      ? `M${x1},${y1} H${x1 + 6} V${y2} H${x2}`
                      : `M${x1},${y1} h6 V${(y1 + y2) / 2} H${x2 - 8} V${y2} H${x2}`;
                    return <path key={`${from}-${to}`} d={d} fill="none" stroke="currentColor" strokeWidth={1.25} markerEnd="url(#gantt-arrow)" />;
                  })}
                </svg>

                {bars.map((original, row) => {
                  const bar = shown(original, preview);
                  const done = bar.task.status === "done";
                  return (
                    <div key={bar.task.id}>
                      <div role="button" tabIndex={0}
                        aria-label={`${bar.task.title}: ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(dayDate(bar.start))} to ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(dayDate(bar.end))}`}
                        title={canWrite ? "Drag to move; drag an end to change that date" : bar.task.title}
                        onClick={() => { if (!dragged.current) onOpenTask(bar.task.id); }}
                        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpenTask(bar.task.id); } }}
                        onPointerDown={(event) => begin(event, original, "move")}
                        className={`absolute z-10 flex touch-none select-none items-center overflow-hidden rounded-md border px-2 text-[11px] ${canWrite ? "cursor-grab" : "cursor-pointer"} ${
                          done ? "border-[var(--hairline)] bg-[var(--surface-2)] text-[var(--muted-foreground)] line-through" : "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--foreground)]"
                        } ${preview?.taskId === bar.task.id ? "shadow-lg ring-2 ring-[var(--accent)]" : ""}`}
                        style={{ left: (bar.start - first) * DAY_PX + 2, width: (bar.end - bar.start + 1) * DAY_PX - 4, top: row * ROW_PX + 5, height: ROW_PX - 10 }}>
                        <span className="truncate">{bar.task.title}</span>
                        {canWrite ? (
                          <>
                            <span aria-hidden onPointerDown={(event) => begin(event, original, "start")} className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize" />
                            <span aria-hidden onPointerDown={(event) => begin(event, original, "end")} className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize" />
                          </>
                        ) : null}
                      </div>
                      {bar.deadline !== null ? (
                        <span title="Deadline" aria-hidden className="absolute z-10 w-0.5 bg-red-500"
                          style={{ left: (bar.deadline - first + 1) * DAY_PX - 2, top: row * ROW_PX + 3, height: ROW_PX - 6 }} />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-[var(--hairline)] p-6 text-center text-sm text-[var(--muted-foreground)]">
          No dated tasks yet. Give tasks a start or due date to see them here.
        </p>
      )}
      {undated.length ? (
        <div>
          <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">No dates · {undated.length}</h3>
          <ul className="flex flex-wrap gap-2">
            {undated.map((task) => (
              <li key={task.id}>
                <button type="button" onClick={() => onOpenTask(task.id)}
                  className="rounded-lg border border-[var(--hairline)] px-2 py-1 text-xs text-[var(--foreground)] hover:border-[var(--accent)]">
                  {task.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
