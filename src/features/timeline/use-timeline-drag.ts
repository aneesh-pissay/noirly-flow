"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Task } from "@/src/core/sync/types";
import { blockDuration, dropToIso, minutesAt, movedStart, resizedDuration } from "@/src/features/timeline/drag";

export type DragKind = "move" | "resize" | "place";
export type DragPreview = { task: Task; kind: DragKind; day: Date; start: number; end: number };

/** Pointer travel (px) before a press counts as a drag rather than a click. */
const DRAG_THRESHOLD = 4;

/** Day columns carry data-timeline-day (their ISO midnight). */
function columnAt(x: number, y: number, days: Date[]) {
  for (const element of document.elementsFromPoint(x, y)) {
    const key = element instanceof HTMLElement ? element.dataset.timelineDay : undefined;
    const day = key ? days.find((d) => d.toISOString() === key) : undefined;
    if (day) return { day, rect: element.getBoundingClientRect() };
  }
  return null;
}

/** The tasks as they'd be with the drag dropped where it is now: the timeline draws this live. */
export function withPreview(tasks: Task[], preview: DragPreview | null): Task[] {
  if (!preview) return tasks;
  const moved: Task = {
    ...preview.task,
    dueAt: dropToIso(preview.day, preview.start),
    dueHasTime: true,
    durationMinutes: preview.end - preview.start,
  };
  return tasks.some((task) => task.id === moved.id)
    ? tasks.map((task) => (task.id === moved.id ? moved : task))
    : [...tasks, moved];
}

/**
 * Time blocking with pointer events (mouse, pen and touch): move a block to
 * another time or day, drag its bottom edge to change its duration, or drag
 * a task in from the side to give it a time. Snaps to 15 minutes. A press
 * that doesn't travel is left to the click handler.
 */
export function useTimelineDrag({ hourPx, days, onDrop }: {
  hourPx: number;
  days: Date[];
  onDrop: (drop: DragPreview) => void;
}) {
  const [preview, setPreview] = useState<DragPreview | null>(null);
  /** True right after a drag, so the click that follows doesn't open the task. */
  const dragged = useRef(false);

  function begin(event: ReactPointerEvent, task: Task, kind: DragKind, block?: { day: Date; start: number }) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const duration = blockDuration(task.durationMinutes);
    // Where on the block it was grabbed, so it doesn't jump to the pointer.
    let grabOffset = kind === "place" ? Math.min(duration, 60) / 2 : 0;
    if (kind === "move" && block) {
      const column = columnAt(startX, startY, days);
      if (column) grabOffset = minutesAt(startY - column.rect.top, hourPx) - block.start;
    }
    let moved = false;
    let current: DragPreview | null = null;

    const onMove = (e: PointerEvent) => {
      if (!moved && Math.hypot(e.clientX - startX, e.clientY - startY) < DRAG_THRESHOLD) return;
      moved = true;
      if (kind === "resize" && block) {
        const column = document.querySelector<HTMLElement>(`[data-timeline-day="${block.day.toISOString()}"]`);
        if (!column) return;
        const pointer = minutesAt(e.clientY - column.getBoundingClientRect().top, hourPx);
        current = { task, kind, day: block.day, start: block.start, end: block.start + resizedDuration(block.start, pointer) };
      } else {
        const column = columnAt(e.clientX, e.clientY, days);
        if (!column) {
          // Off the grid: a new task has nowhere to go; a moved block stays where it was last.
          if (kind === "place") current = null;
          setPreview(current);
          return;
        }
        const start = movedStart(minutesAt(e.clientY - column.rect.top, hourPx), grabOffset, duration);
        current = { task, kind, day: column.day, start, end: start + duration };
      }
      setPreview(current);
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
      if (commit && moved && current) onDrop(current);
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

  return { preview, begin, dragged };
}
