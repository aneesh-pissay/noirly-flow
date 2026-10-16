/** Lead times offered for reminders, in minutes before the due time. */
export const REMINDER_PRESETS = [0, 5, 10, 15, 30, 60, 120, 1440] as const;

/** When a reminder fires: only for a task with a due time and a lead time. */
export function reminderAtFor(
  dueAt: Date | null | undefined,
  dueHasTime: boolean | null | undefined,
  minutes: number | null | undefined,
): Date | null {
  if (!dueAt || !dueHasTime || minutes == null) return null;
  return new Date(dueAt.getTime() - minutes * 60_000);
}

/** "At the due time", "15 minutes before", "1 hour before", "1 day before". */
export function describeReminder(minutes: number): string {
  if (minutes === 0) return "At the due time";
  if (minutes % 1440 === 0) return minutes === 1440 ? "1 day before" : `${minutes / 1440} days before`;
  if (minutes % 60 === 0) return minutes === 60 ? "1 hour before" : `${minutes / 60} hours before`;
  return `${minutes} minutes before`;
}
