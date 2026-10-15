/**
 * A minimal RFC 5545 calendar of all-day events, one per task due date.
 * Pure: no database or request access, so it is unit tested directly.
 */

export type FeedTask = {
  id: string;
  title: string;
  description: string | null;
  dueAt: Date;
  done: boolean;
  updatedAt: Date;
  /** "Project name" or "Inbox", plus the workspace, shown in the event notes. */
  where: string;
  url: string;
};

/** RFC 5545 §3.3.11: backslash, semicolon, comma and newlines are escaped. */
export function escapeText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** RFC 5545 §3.1: lines over 75 octets continue on the next line after a space. */
export function foldLine(line: string) {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    // Continuation lines start with a space, which counts toward their 75.
    const limit = parts.length === 0 ? 75 : 74;
    if (size + bytes > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/** The calendar date (YYYYMMDD) of an instant in a time zone. */
export function dateInZone(date: Date, timeZone: string) {
  let zone = timeZone;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone });
  } catch {
    zone = "UTC";
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}${get("month")}${get("day")}`;
}

function nextDay(yyyymmdd: string) {
  const date = new Date(Date.UTC(Number(yyyymmdd.slice(0, 4)), Number(yyyymmdd.slice(4, 6)) - 1, Number(yyyymmdd.slice(6, 8)) + 1));
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function stamp(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function buildCalendar(input: { name: string; timeZone: string; tasks: FeedTask[]; host: string }) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Noirly//Flow//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(input.name)}`,
    "X-WR-CALDESC:Due dates from Noirly Flow",
    // A hint only; Google refreshes subscribed calendars on its own schedule.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const task of input.tasks) {
    const day = dateInZone(task.dueAt, input.timeZone);
    const notes = [task.where, task.description?.trim() || null, task.url].filter(Boolean).join("\n\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${task.id}@${input.host}`,
      `DTSTAMP:${stamp(task.updatedAt)}`,
      `LAST-MODIFIED:${stamp(task.updatedAt)}`,
      `DTSTART;VALUE=DATE:${day}`,
      `DTEND;VALUE=DATE:${nextDay(day)}`,
      `SUMMARY:${escapeText(`${task.done ? "✓ " : ""}${task.title}`)}`,
      `DESCRIPTION:${escapeText(notes)}`,
      `URL:${task.url}`,
      // Due dates shouldn't block time on anyone's calendar.
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
