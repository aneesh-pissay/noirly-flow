import {
  dueClassName,
  dueTone,
  formatDue,
  formatTime,
  startsLater,
} from "@/src/features/task/dates";

/** "Starts Oct 20", only while the start date is still ahead. */
export function TaskStartBadge({ startAt }: { startAt: string | null | undefined }) {
  if (!startAt || !startsLater(startAt)) return null;
  return (
    <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
      Starts {formatDue(startAt)}
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
