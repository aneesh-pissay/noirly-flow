import { RECURRENCE_FREQUENCIES } from "@/src/core/models/enums";
import type { RecurrenceRule } from "@/src/core/sync/types";

/**
 * Recurrence works on the calendar of the zone the rule was made in, so
 * "every Monday" or "monthly on the 31st" means the user's Monday and the
 * user's 31st even though the server runs in UTC. Rules saved before zones
 * were recorded fall back to the server's own zone, which is how they were
 * computed before.
 */

type Wall = { year: number; month: number; day: number; hour: number; minute: number; second: number; ms: number };

function serverZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function isTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(timeZone: string) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23",
      year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", minute: "numeric", second: "numeric",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** The wall-clock reading of an instant in a zone. */
function toWall(instant: Date, timeZone: string): Wall {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: get("year"), month: get("month") - 1, day: get("day"),
    hour: get("hour"), minute: get("minute"), second: get("second"), ms: instant.getUTCMilliseconds(),
  };
}

const wallAsUtc = (w: Wall) => Date.UTC(w.year, w.month, w.day, w.hour, w.minute, w.second, w.ms);

/** The instant a wall-clock reading names in a zone (the later one across a DST gap). */
function fromWall(wall: Wall, timeZone: string): Date {
  const target = wallAsUtc(wall);
  let guess = target;
  for (let i = 0; i < 3; i += 1) {
    const offset = wallAsUtc(toWall(new Date(guess), timeZone)) - guess;
    const next = target - offset;
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess);
}

/** A calendar day, as y/m/d with month 0-based. */
type Day = { year: number; month: number; day: number };

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
const dayValue = (d: Day) => Date.UTC(d.year, d.month, d.day);
const fromValue = (value: number): Day => {
  const date = new Date(value);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() };
};
const addDays = (d: Day, days: number) => fromValue(dayValue(d) + days * 86_400_000);
/** 0 = Monday … 6 = Sunday, so a week runs Monday to Sunday. */
const mondayIndex = (d: Day) => (new Date(dayValue(d)).getUTCDay() + 6) % 7;

function addMonths(d: Day, months: number, monthDay: number): Day {
  const total = d.month + months;
  const year = d.year + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  return { year, month, day: Math.min(monthDay, daysInMonth(year, month)) };
}

/** The next day the rule lands on after `from`. */
function stepDay(from: Day, rule: RecurrenceRule): Day {
  const interval = Math.max(1, rule.interval || 1);
  switch (rule.frequency) {
    case "daily":
      return addDays(from, interval);
    case "weekly": {
      const days = [...new Set(rule.byWeekday ?? [])].map((d) => (d + 6) % 7).sort((a, b) => a - b);
      if (!days.length) return addDays(from, 7 * interval);
      const today = mondayIndex(from);
      const laterThisWeek = days.find((d) => d > today);
      if (laterThisWeek !== undefined) return addDays(from, laterThisWeek - today);
      const monday = addDays(from, -today);
      return addDays(monday, 7 * interval + days[0]!);
    }
    case "monthly":
      return addMonths(from, interval, rule.monthDay ?? from.day);
    case "yearly":
      return addMonths(from, 12 * interval, rule.monthDay ?? from.day);
  }
}

/** One step of the rule from an instant, keeping its local time of day. */
export function addRecurrenceInterval(from: Date, rule: RecurrenceRule): Date {
  const zone = rule.timeZone ?? serverZone();
  const wall = toWall(from, zone);
  return fromWall({ ...wall, ...stepDay(wall, rule) }, zone);
}

/**
 * Next due date for a completed occurrence. Counts from the due date, or from
 * today when the rule says "after completion", keeping the due time of day.
 * A due-date rule skips forward past missed occurrences to today or later.
 */
export function nextOccurrenceDueAt(
  dueAt: string | Date | null | undefined,
  rule: RecurrenceRule,
  now = new Date(),
): Date {
  const zone = rule.timeZone ?? serverZone();
  const parsed = dueAt instanceof Date ? dueAt : dueAt ? new Date(dueAt) : null;
  const due = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
  const nowWall = toWall(now, zone);
  const clock = toWall(due ?? now, zone);
  let day: Day = rule.fromCompletion || !due ? nowWall : clock;
  day = stepDay(day, rule);
  const today = dayValue(nowWall);
  for (let guard = 0; dayValue(day) < today && guard < 1000; guard += 1) {
    day = stepDay(day, rule);
  }
  return fromWall({ ...clock, ...day }, zone);
}

/** A clean rule from stored or submitted data, or null for none or an unsupported one. */
export function asRecurrenceRule(
  value: {
    frequency?: string;
    interval?: number | null;
    byWeekday?: number[] | null;
    monthDay?: number | null;
    fromCompletion?: boolean | null;
    timeZone?: string | null;
  } | null | undefined,
): RecurrenceRule | null {
  const frequency = RECURRENCE_FREQUENCIES.find((f) => f === value?.frequency);
  if (!value || !frequency) return null;
  const rule: RecurrenceRule = {
    frequency,
    interval: Math.min(365, Math.max(1, Math.round(value.interval || 1))),
  };
  const weekdays = [...new Set(value.byWeekday ?? [])].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
  if (frequency === "weekly" && weekdays.length) rule.byWeekday = weekdays;
  if ((frequency === "monthly" || frequency === "yearly") && value.monthDay && value.monthDay >= 1 && value.monthDay <= 31) {
    rule.monthDay = Math.round(value.monthDay);
  }
  if (value.fromCompletion) rule.fromCompletion = true;
  if (isTimeZone(value.timeZone)) rule.timeZone = value.timeZone;
  return rule;
}
