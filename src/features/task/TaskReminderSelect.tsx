import { REMINDER_PRESETS, describeReminder } from "@/src/core/reminders";

/**
 * Reminder lead time. Reminders need a due time, so without one the select is
 * disabled and says why; a lead time already set is kept for when a time is added.
 */
export function TaskReminderSelect({ value, hasTime, onChange, disabled = false, className }: {
  value: number | null;
  hasTime: boolean;
  onChange: (minutes: number | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  const options: number[] = [...REMINDER_PRESETS];
  if (value != null && !options.includes(value)) options.push(value);
  options.sort((a, b) => a - b);
  return (
    <>
      <select
        aria-label="Reminder"
        value={value ?? ""}
        disabled={disabled || !hasTime}
        onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
        className={className}
      >
        <option value="">No reminder</option>
        {options.map((minutes) => <option key={minutes} value={minutes}>{describeReminder(minutes)}</option>)}
      </select>
      {!hasTime ? <span className="block text-[11px] text-[var(--muted-foreground)]">Add a due time to set a reminder.</span> : null}
    </>
  );
}
