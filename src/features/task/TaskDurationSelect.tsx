import { DURATION_PRESETS, formatDuration } from "@/src/features/task/dates";

/** "No estimate" plus the preset lengths; a value set elsewhere (the API) is kept as an option. */
export function TaskDurationSelect({ value, onChange, disabled = false, className }: {
  value: number | null;
  onChange: (minutes: number | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  const options: number[] = [...DURATION_PRESETS];
  if (value && !options.includes(value)) options.push(value);
  options.sort((a, b) => a - b);
  return (
    <select
      aria-label="Duration"
      value={value ?? ""}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
      className={className}
    >
      <option value="">No estimate</option>
      {options.map((minutes) => (
        <option key={minutes} value={minutes}>{formatDuration(minutes)}</option>
      ))}
    </select>
  );
}
