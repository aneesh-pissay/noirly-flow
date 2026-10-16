import {
  dueClassName,
  dueTone,
  formatDue,
  formatTime,
} from "@/src/features/task/dates";

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
