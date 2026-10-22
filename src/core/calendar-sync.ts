import { dayInZone, noonOnDay } from "@/src/core/recurrence/next";

export const SYNC_PROVIDERS = ["google", "outlook"] as const;
export type SyncProviderId = (typeof SYNC_PROVIDERS)[number];

export const SYNC_PROVIDER_LABEL: Record<SyncProviderId, string> = { google: "Google Calendar", outlook: "Outlook" };

/** Timed tasks without an estimate show as this long. */
export const DEFAULT_EVENT_MINUTES = 30;

/** What Flow writes to the calendar for one task. All-day dates are "YYYY-MM-DD", end exclusive. */
export type EventInput = {
  title: string;
  description: string;
  allDay: boolean;
  start: string;
  end: string;
  timeZone: string;
};

/** An event as read back from the calendar. */
export type RemoteEvent = {
  id: string;
  deleted: boolean;
  title: string;
  allDay: boolean;
  /** "YYYY-MM-DD" for all-day events, an ISO instant otherwise. */
  start: string;
  end: string;
  /** When the calendar last changed it, if it says. */
  updatedAt: string | null;
};

export type SyncTask = {
  id: string;
  title: string;
  description: string | null;
  dueAt: string;
  dueHasTime: boolean;
  durationMinutes: number | null;
};

const nextDay = (day: string) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

/** The event for a task, in the person's zone, with a link back to it. */
export function taskToEvent(task: SyncTask, timeZone: string, url: string): EventInput {
  const description = [task.description?.trim(), `Open in Noirly Flow: ${url}`].filter(Boolean).join("\n\n");
  if (!task.dueHasTime) {
    const day = dayInZone(new Date(task.dueAt), timeZone);
    return { title: task.title, description, allDay: true, start: day, end: nextDay(day), timeZone };
  }
  const start = new Date(task.dueAt);
  const end = new Date(start.getTime() + (task.durationMinutes ?? DEFAULT_EVENT_MINUTES) * 60_000);
  return { title: task.title, description, allDay: false, start: start.toISOString(), end: end.toISOString(), timeZone };
}

/** A short fingerprint of what was written, to tell later whether either side changed. */
export function fingerprint(event: Pick<EventInput, "title" | "allDay" | "start" | "end">) {
  const text = `${event.title}\u0000${event.allDay}\u0000${event.start}\u0000${event.end}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** The same fingerprint for an event read back, normalising how calendars write times. */
export function remoteFingerprint(event: RemoteEvent) {
  return fingerprint({
    title: event.title,
    allDay: event.allDay,
    start: event.allDay ? event.start.slice(0, 10) : new Date(event.start).toISOString(),
    end: event.allDay ? event.end.slice(0, 10) : new Date(event.end).toISOString(),
  });
}

/** What an edited event says about its task: title and when. */
export function eventToTaskFields(event: RemoteEvent, timeZone: string) {
  const title = event.title.trim();
  if (event.allDay) {
    return { title, dueAt: noonOnDay(event.start.slice(0, 10), timeZone).toISOString(), dueHasTime: false, durationMinutes: undefined };
  }
  const start = new Date(event.start);
  const minutes = Math.round((new Date(event.end).getTime() - start.getTime()) / 60_000);
  return { title, dueAt: start.toISOString(), dueHasTime: true, durationMinutes: Math.min(1440, Math.max(1, minutes)) };
}

/** Only the fields that differ from the task as it is. */
export function taskPatchFromEvent(event: RemoteEvent, task: SyncTask, timeZone: string) {
  const fields = eventToTaskFields(event, timeZone);
  const patch: { title?: string; dueAt?: string; dueHasTime?: boolean; durationMinutes?: number } = {};
  if (fields.title && fields.title !== task.title) patch.title = fields.title.slice(0, 500);
  if (fields.dueAt !== new Date(task.dueAt).toISOString()) patch.dueAt = fields.dueAt;
  if (fields.dueHasTime !== task.dueHasTime) patch.dueHasTime = fields.dueHasTime;
  if (fields.durationMinutes !== undefined && fields.durationMinutes !== (task.durationMinutes ?? DEFAULT_EVENT_MINUTES)) {
    patch.durationMinutes = fields.durationMinutes;
  }
  return patch;
}
