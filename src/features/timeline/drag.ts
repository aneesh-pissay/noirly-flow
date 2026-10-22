import { DEFAULT_BLOCK_MINUTES } from "@/src/features/timeline/layout";

/** Drags snap to this many minutes. */
export const SNAP_MINUTES = 15;
const DAY_MINUTES = 24 * 60;

export function snap(minutes: number, step = SNAP_MINUTES) {
  return Math.round(minutes / step) * step;
}

/** Minutes from the top of a day column, for a pointer `offsetY` pixels down it. */
export function minutesAt(offsetY: number, hourPx: number) {
  return (offsetY / hourPx) * 60;
}

/** Where a moved (or newly placed) block starts: snapped, and kept inside the day. */
export function movedStart(pointerMinutes: number, grabOffset: number, duration: number) {
  return Math.min(Math.max(0, snap(pointerMinutes - grabOffset)), DAY_MINUTES - Math.min(duration, DAY_MINUTES));
}

/** A resized block's duration: snapped, at least one step, not past midnight. */
export function resizedDuration(start: number, pointerMinutes: number) {
  return Math.min(Math.max(SNAP_MINUTES, snap(pointerMinutes - start)), DAY_MINUTES - start);
}

/** The duration a block is drawn and dropped with. */
export function blockDuration(durationMinutes: number | null | undefined) {
  return durationMinutes || DEFAULT_BLOCK_MINUTES;
}

/** A local day plus minutes after its midnight, as the ISO instant to save. */
export function dropToIso(day: Date, minutes: number) {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes).toISOString();
}
