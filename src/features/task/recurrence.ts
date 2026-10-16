import type { RecurrenceRule } from "@/src/core/sync/types";

export type RepeatPreset = "daily" | "weekdays" | "weekly" | "monthly" | "yearly";

const WEEKDAYS_MON_FRI = [1, 2, 3, 4, 5];

/** The browser's zone, saved on the rule so the server counts days the way the user sees them. */
export function browserZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** The day a new rule anchors on: "YYYY-MM-DD", or today when the task has no date. */
export function anchorDay(date: string): Date {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date();
}

export function presetRule(preset: RepeatPreset, anchor: Date): RecurrenceRule {
  const timeZone = browserZone();
  const base = { interval: 1, ...(timeZone ? { timeZone } : {}) };
  switch (preset) {
    case "daily": return { frequency: "daily", ...base };
    case "weekdays": return { frequency: "weekly", ...base, byWeekday: WEEKDAYS_MON_FRI };
    case "weekly": return { frequency: "weekly", ...base, byWeekday: [anchor.getDay()] };
    case "monthly": return { frequency: "monthly", ...base, monthDay: anchor.getDate() };
    case "yearly": return { frequency: "yearly", ...base, monthDay: anchor.getDate() };
  }
}

const sameDays = (a: number[] | undefined, b: number[]) =>
  (a ?? []).length === b.length && [...(a ?? [])].sort().every((day, i) => day === [...b].sort()[i]);

/** Which quick choice a rule is, if it's one of them; anything else is "custom". */
export function presetOf(rule: RecurrenceRule | null, anchor: Date): RepeatPreset | null {
  if (!rule || rule.interval !== 1 || rule.fromCompletion) return null;
  switch (rule.frequency) {
    case "daily": return "daily";
    case "weekly":
      if (sameDays(rule.byWeekday, WEEKDAYS_MON_FRI)) return "weekdays";
      if (!rule.byWeekday?.length || sameDays(rule.byWeekday, [anchor.getDay()])) return "weekly";
      return null;
    case "monthly": return !rule.monthDay || rule.monthDay === anchor.getDate() ? "monthly" : null;
    case "yearly": return !rule.monthDay || rule.monthDay === anchor.getDate() ? "yearly" : null;
  }
}

function weekdayName(day: number, width: "long" | "short") {
  // 2026-08-02 is a Sunday, so day 0–6 maps onto 2–8 August.
  return new Intl.DateTimeFormat(undefined, { weekday: width }).format(new Date(2026, 7, 2 + day));
}

/** Monday-first weekday numbers with short labels, for toggles. */
export const WEEK = [1, 2, 3, 4, 5, 6, 0].map((day) => ({ day, label: weekdayName(day, "short") }));

export function presetLabel(preset: RepeatPreset, anchor: Date): string {
  switch (preset) {
    case "daily": return "Daily";
    case "weekdays": return "Every weekday (Mon–Fri)";
    case "weekly": return `Weekly on ${weekdayName(anchor.getDay(), "long")}`;
    case "monthly": return `Monthly on day ${anchor.getDate()}`;
    case "yearly": return `Yearly on ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(anchor)}`;
  }
}

const UNITS = { daily: ["day", "days"], weekly: ["week", "weeks"], monthly: ["month", "months"], yearly: ["year", "years"] } as const;

/** "Every 2 weeks on Mon, Wed after completion". */
export function describeRecurrence(rule: RecurrenceRule): string {
  const [one, many] = UNITS[rule.frequency];
  let text = rule.interval === 1 ? `Every ${one}` : `Every ${rule.interval} ${many}`;
  if (rule.frequency === "weekly" && rule.byWeekday?.length) {
    text = rule.interval === 1 && sameDays(rule.byWeekday, WEEKDAYS_MON_FRI)
      ? "Every weekday"
      : `${text} on ${WEEK.filter((w) => rule.byWeekday!.includes(w.day)).map((w) => w.label).join(", ")}`;
  }
  if (rule.frequency === "monthly" && rule.monthDay) text += ` on day ${rule.monthDay}`;
  if (rule.fromCompletion) text += " after completion";
  return text;
}
