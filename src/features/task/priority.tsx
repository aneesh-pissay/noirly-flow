import type { TaskPriority } from "@/src/core/models/enums";

/**
 * One hue per priority, cool to hot. The palette has no semantic colours of its
 * own (just neutrals and the accent), so these are fixed Tailwind hues, with a
 * lighter step under `.dark` so they read on both backgrounds.
 */
const PRIORITY_TONES: Record<TaskPriority, { text: string; dot: string }> = {
  none: {
    text: "text-[var(--muted-foreground)]",
    dot: "border border-[var(--muted-foreground)]",
  },
  low: { text: "text-sky-600 dark:text-sky-400", dot: "bg-sky-500 dark:bg-sky-400" },
  medium: { text: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500 dark:bg-amber-400" },
  high: { text: "text-red-600 dark:text-red-400", dot: "bg-red-500 dark:bg-red-400" },
  urgent: { text: "text-rose-700 dark:text-rose-300", dot: "bg-rose-600 dark:bg-rose-300" },
};

/** Text colour for a priority, e.g. on the priority <select>. */
export function priorityTextClassName(priority: TaskPriority): string {
  return PRIORITY_TONES[priority].text;
}

/** The priority's dot, for places too tight for the full badge. */
export function priorityDotClassName(priority: TaskPriority): string {
  return PRIORITY_TONES[priority].dot;
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const tone = PRIORITY_TONES[priority];
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide ${tone.text}`}
    >
      <span aria-hidden className={`size-2 shrink-0 rounded-full ${tone.dot}`} />
      {priority === "none" ? "no priority" : priority}
    </span>
  );
}
