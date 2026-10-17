import { Repeat } from "lucide-react";
import type { RecurrenceRule } from "@/src/core/sync/types";
import { describeRecurrence } from "@/src/features/task/recurrence";
import {
  dueClassName,
  dueTone,
  formatDue,
  formatDuration,
  formatTime,
  startsLater,
} from "@/src/features/task/dates";

/** A repeat icon with the rule spelled out for screen readers and on hover. */
export function TaskRepeatBadge({ rule }: { rule: RecurrenceRule | null | undefined }) {
  if (!rule) return null;
  const text = describeRecurrence(rule);
  return (
    <span title={text} className="inline-flex items-center text-[var(--muted-foreground)]">
      <Repeat size={12} aria-hidden />
      <span className="sr-only">{text}</span>
    </span>
  );
}

/** The estimate, e.g. "45m". */
export function TaskDurationBadge({ minutes }: { minutes: number | null | undefined }) {
  if (!minutes) return null;
  return (
    <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
      {formatDuration(minutes)}
    </span>
  );
}

/** "Starts Oct 20", only while the start date is still ahead. */
export function TaskStartBadge({ startAt }: { startAt: string | null | undefined }) {
  if (!startAt || !startsLater(startAt)) return null;
  return (
    <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
      Starts {formatDue(startAt)}
    </span>
  );
}

/** "Deadline Oct 30"; marked once the deadline day has passed. */
export function TaskDeadlineBadge({ deadlineAt }: { deadlineAt: string | null | undefined }) {
  const label = formatDue(deadlineAt);
  if (!label) return null;
  const tone = dueTone(deadlineAt);
  return (
    <span className={`font-mono text-[11px] uppercase tracking-wide ${dueClassName(tone)}`}>
      {tone === "overdue" ? `Deadline passed · ${label}` : tone === "today" ? "Deadline today" : `Deadline ${label}`}
    </span>
  );
}

export function TaskDueBadge({ dueAt, hasTime = false }: {
  dueAt: string | null | undefined;
  hasTime?: boolean;
}) {
  const label = formatDue(dueAt, hasTime);
  if (!label || !dueAt) return null;
  const tone = dueTone(dueAt, hasTime);

  return (
    <span className={`font-mono text-[11px] uppercase tracking-wide ${dueClassName(tone)}`}>
      {tone === "overdue"
        ? `Overdue · ${label}`
        : tone === "today"
          ? `Today · ${hasTime ? formatTime(dueAt) : label}`
          : label}
    </span>
  );
}
