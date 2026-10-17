import type { TaskPriority } from "@/src/core/models/enums";
import type { RecurrenceRule } from "@/src/core/sync/types";
import { describeRecurrence } from "@/src/features/task/recurrence";

/**
 * Natural-language quick add: pulls a due date, time, repeat, priority and
 * project out of a task title, e.g. "Pay rent every 1st 9am p1 #Home".
 * Deliberately conservative — a word only counts when it can't plausibly be
 * part of the title ("sat" alone is not Saturday, "may" alone is not May).
 */
export type QuickAdd = {
  /** The title with everything recognised taken out. */
  title: string;
  dueDate?: string;
  dueTime?: string;
  priority?: TaskPriority;
  /** Set when a #project matched; null means #inbox. */
  projectId?: string | null;
  recurrence?: RecurrenceRule;
  /** Human-readable list of what was recognised, for a preview. */
  labels: string[];
};

type Project = { id: string; name: string };
type Day = Date;

const WEEKDAY_FULL = "sunday|monday|tuesday|wednesday|thursday|friday|saturday";
const WEEKDAY_ANY = "sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?";
const MONTH = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const ORD = "(?:st|nd|rd|th)?";
/** Words that only lead into a date, dropped with it: "due friday", "by aug 14", "on mon". */
const LEAD = "(?:(?:due(?:\\s+on)?|by|on)\\s+)?";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Day) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const plusDays = (d: Day, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const daysIn = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

function weekdayIndex(word: string): number {
  const w = word.toLowerCase().slice(0, 2);
  return ["su", "mo", "tu", "we", "th", "fr", "sa"].indexOf(w);
}

function monthIndex(word: string): number {
  return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(word.toLowerCase().slice(0, 3));
}

/** The next day (after today, or from today with `includeToday`) that is one of `weekdays`. */
function nextWeekday(today: Day, weekdays: number[], includeToday: boolean): Day {
  for (let i = includeToday ? 0 : 1; i <= 7; i += 1) {
    const day = plusDays(today, i);
    if (weekdays.includes(day.getDay())) return day;
  }
  return today;
}

/** That day of the month this month if it hasn't passed, else next month; short months use their last day. */
function nextMonthDay(today: Day, monthDay: number): Day {
  for (let add = 0; add < 2; add += 1) {
    const year = today.getFullYear() + Math.floor((today.getMonth() + add) / 12);
    const month = (today.getMonth() + add) % 12;
    const day = new Date(year, month, Math.min(monthDay, daysIn(year, month)));
    if (day >= today) return day;
  }
  return today;
}

/** A month and day this year, or next year once it has passed. */
function nextDate(today: Day, month: number, day: number): Day | null {
  if (day < 1 || day > 31) return null;
  for (const year of [today.getFullYear(), today.getFullYear() + 1]) {
    if (day > daysIn(year, month)) continue;
    const date = new Date(year, month, day);
    if (date >= today) return date;
  }
  return null;
}

function to24h(hour: number, minute: number, meridiem?: string): string | null {
  if (minute < 0 || minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem.toLowerCase() === "pm" ? 12 : 0);
  } else if (hour > 23) {
    return null;
  }
  return `${pad(hour)}:${pad(minute)}`;
}

const PRIORITY: Record<string, TaskPriority> = { "1": "high", "2": "medium", "3": "low", "4": "none" };

export function parseQuickAdd(
  input: string,
  options: { now?: Date; projects?: Project[]; timeZone?: string } = {},
): QuickAdd {
  const now = options.now ?? new Date();
  const today = startOf(now);
  let text = ` ${input} `;
  const result: QuickAdd = { title: input.trim(), labels: [] };

  /** Finds a pattern, removes the match from the text, and hands back its groups. */
  function take(pattern: string): RegExpExecArray | null {
    const match = new RegExp(`(?<=\\s)${pattern}(?=\\s|[.,!?;]|$)`, "i").exec(text);
    if (!match) return null;
    text = `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`;
    return match;
  }

  // Project: "#Name", longest name first so "#Home Office" beats "#Home".
  const projects = [...(options.projects ?? [])].sort((a, b) => b.name.length - a.name.length);
  for (const project of [{ id: "", name: "inbox" }, ...projects]) {
    const escaped = project.name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    if (!escaped || !take(`#${escaped}`)) continue;
    result.projectId = project.id || null;
    result.labels.push(project.id ? `#${project.name}` : "#Inbox");
    break;
  }

  const priority = take("p([1-4])");
  if (priority) {
    result.priority = PRIORITY[priority[1]!];
    result.labels.push(`P${priority[1]}`);
  }

  // Repeat. The first match wins.
  const timeZone = options.timeZone;
  const rule = (r: Omit<RecurrenceRule, "timeZone">): RecurrenceRule => (timeZone ? { ...r, timeZone } : r);
  let firstDue: Day | undefined;
  let m: RegExpExecArray | null;
  if ((m = take(`every\\s+(${MONTH})\\s+(\\d{1,2})${ORD}`))) {
    const date = nextDate(today, monthIndex(m[1]!), Number(m[2]));
    if (date) { result.recurrence = rule({ frequency: "yearly", interval: 1, monthDay: date.getDate() }); firstDue = date; }
  } else if ((m = take("every\\s+weekday"))) {
    result.recurrence = rule({ frequency: "weekly", interval: 1, byWeekday: [1, 2, 3, 4, 5] });
    firstDue = nextWeekday(today, [1, 2, 3, 4, 5], true);
  } else if ((m = take("(?:every\\s+day|daily)"))) {
    result.recurrence = rule({ frequency: "daily", interval: 1 });
  } else if ((m = take("every\\s+(\\d{1,3})\\s+(day|week|month|year)s?"))) {
    const unit = { day: "daily", week: "weekly", month: "monthly", year: "yearly" } as const;
    result.recurrence = rule({ frequency: unit[m[2]!.toLowerCase() as keyof typeof unit], interval: Math.min(365, Math.max(1, Number(m[1]))) });
  } else if ((m = take(`every\\s+((?:${WEEKDAY_ANY})(?:\\s*(?:,|and|&)\\s*(?:${WEEKDAY_ANY}))*)`))) {
    const days = [...new Set(m[1]!.split(/\s*(?:,|and|&)\s*/i).map(weekdayIndex).filter((d) => d >= 0))];
    result.recurrence = rule({ frequency: "weekly", interval: 1, byWeekday: days.sort() });
    firstDue = nextWeekday(today, days, true);
  } else if ((m = take(`every\\s+(\\d{1,2})${ORD}(?:\\s+of\\s+the\\s+month)?`))) {
    const monthDay = Number(m[1]);
    if (monthDay >= 1 && monthDay <= 31) {
      result.recurrence = rule({ frequency: "monthly", interval: 1, monthDay });
      firstDue = nextMonthDay(today, monthDay);
    }
  } else if ((m = take("(?:every\\s+week|weekly)"))) {
    result.recurrence = rule({ frequency: "weekly", interval: 1 });
  } else if ((m = take("(?:every\\s+month|monthly)"))) {
    result.recurrence = rule({ frequency: "monthly", interval: 1 });
  } else if ((m = take("(?:every\\s+year|yearly|annually)"))) {
    result.recurrence = rule({ frequency: "yearly", interval: 1 });
  }
  if (result.recurrence) {
    if (firstDue && result.recurrence.frequency === "weekly" && !result.recurrence.byWeekday) {
      result.recurrence.byWeekday = [firstDue.getDay()];
    }
    if (result.recurrence.fromCompletion === undefined && (m = take("after\\s+completion"))) {
      result.recurrence.fromCompletion = true;
    }
  }

  // Time: "9am", "9:30 pm", "at 17:00", "at 9", "17:30", "noon", "midnight".
  if ((m = take("(?:at\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)"))) {
    result.dueTime = to24h(Number(m[1]), Number(m[2] ?? 0), m[3]) ?? undefined;
  } else if ((m = take("at\\s+(\\d{1,2})(?::(\\d{2}))?")) || (m = take("(\\d{1,2}):(\\d{2})"))) {
    result.dueTime = to24h(Number(m[1]), Number(m[2] ?? 0)) ?? undefined;
  } else if ((m = take("(?:at\\s+)?(noon|midnight)"))) {
    result.dueTime = m[1]!.toLowerCase() === "noon" ? "12:00" : "00:00";
  }

  // Date.
  let due: Day | undefined;
  if ((m = take(`${LEAD}(\\d{4})-(\\d{2})-(\\d{2})`))) {
    const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (date.getMonth() === Number(m[2]) - 1) due = date;
  } else if ((m = take(`${LEAD}today`))) {
    due = today;
  } else if ((m = take(`${LEAD}(?:tomorrow|tmrw)`))) {
    due = plusDays(today, 1);
  } else if ((m = take(`${LEAD}in\\s+(\\d{1,3})\\s+(day|week)s?`))) {
    due = plusDays(today, Number(m[1]) * (m[2]!.toLowerCase() === "week" ? 7 : 1));
  } else if ((m = take(`${LEAD}next\\s+week`))) {
    due = nextWeekday(plusDays(today, 1), [1], true);
  } else if ((m = take(`${LEAD}(${MONTH})\\s+(\\d{1,2})${ORD}`)) || (m = take(`${LEAD}(\\d{1,2})${ORD}\\s+(${MONTH})`))) {
    const [month, day] = /^\d/.test(m[1]!) ? [monthIndex(m[2]!), Number(m[1])] : [monthIndex(m[1]!), Number(m[2])];
    due = nextDate(today, month, day) ?? undefined;
  } else if ((m = take(`(?:(?:due(?:\\s+on)?|by|on|next)\\s+)(${WEEKDAY_ANY})`)) || (m = take(`${LEAD}(${WEEKDAY_FULL})`))) {
    due = nextWeekday(today, [weekdayIndex(m[1]!)], false);
  }

  // A repeat without its own date starts on its first day; a time alone means today, or tomorrow once it has passed.
  if (!due && firstDue) due = firstDue;
  if (!due && result.recurrence) due = today;
  if (!due && result.dueTime) {
    const [h, min] = result.dueTime.split(":").map(Number);
    due = new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, min) <= now ? plusDays(today, 1) : today;
  }

  if (due) {
    result.dueDate = ymd(due);
    const dateLabel = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(due);
    const timeLabel = result.dueTime
      ? `, ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(2000, 0, 1, ...(result.dueTime.split(":").map(Number) as [number, number])))}`
      : "";
    result.labels.unshift(`Due ${dateLabel}${timeLabel}`);
  }
  if (result.recurrence) result.labels.push(describeRecurrence(result.recurrence));

  const title = text.replace(/\s+/g, " ").trim().replace(/\s+(?:due|by|on|at)$/i, "");
  // Never leave an empty title: keep what was typed when everything was a keyword.
  if (title) result.title = title;
  return result;
}
