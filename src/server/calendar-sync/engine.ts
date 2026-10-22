import { Types } from "mongoose";
import { withDb } from "@/src/server/db/mongodb";
import {
  CalendarConnection, CalendarEventLink, FlowUser, Project, Task, WorkspaceMembership, type CalendarConnectionDocument,
} from "@/src/server/models";
import { providerFor } from "@/src/server/api/http";
import { CALENDAR_APIS, CalendarApiError } from "@/src/server/calendar-sync/providers";
import { openToken, sealToken } from "@/src/server/calendar-sync/crypto";
import {
  fingerprint, remoteFingerprint, taskPatchFromEvent, taskToEvent, type SyncProviderId, type SyncTask,
} from "@/src/core/calendar-sync";

const LOCK_MS = 5 * 60_000;
const PAST_DAYS = 30;
const AHEAD_DAYS = 365;
const MAX_TASKS = 1000;
/** Calendar writes per run; the rest wait for the next one. */
const MAX_WRITES = 300;

function appOrigin() {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.AUTH_URL || "http://localhost:3002";
  return new URL(base).origin;
}

/** A usable access token, refreshing (and saving) it when it's about to expire. */
async function accessToken(connection: CalendarConnectionDocument) {
  if (connection.expiresAt.getTime() > Date.now() + 2 * 60_000) return openToken(connection.accessToken);
  if (!connection.refreshToken) throw new CalendarApiError(401, "Reconnect your calendar");
  const api = CALENDAR_APIS[connection.provider as SyncProviderId];
  const tokens = await api.refresh(openToken(connection.refreshToken));
  await CalendarConnection.updateOne({ _id: connection._id }, { $set: {
    accessToken: sealToken(tokens.accessToken),
    refreshToken: tokens.refreshToken ? sealToken(tokens.refreshToken) : connection.refreshToken,
    expiresAt: tokens.expiresAt,
  } });
  return tokens.accessToken;
}

/** The open, dated tasks that belong on someone's calendar: theirs, or unassigned ones they made. */
async function tasksInScope(userId: Types.ObjectId) {
  const memberships = await WorkspaceMembership.find({ userId }).select("workspaceId").lean();
  const workspaceIds = memberships.map((m) => m.workspaceId);
  const liveProjects = new Set((await Project.find({ workspaceId: { $in: workspaceIds }, deletedAt: null, archivedAt: null }).select("_id").lean()).map((p) => String(p._id)));
  const now = Date.now();
  const docs = await Task.find({
    workspaceId: { $in: workspaceIds },
    deletedAt: null,
    status: { $in: ["todo", "in_progress"] },
    dueAt: { $gte: new Date(now - PAST_DAYS * 86_400_000), $lte: new Date(now + AHEAD_DAYS * 86_400_000) },
    $or: [{ assigneeIds: userId }, { createdById: userId, "assigneeIds.0": { $exists: false } }],
  }).sort({ dueAt: 1 }).limit(MAX_TASKS).select("title description dueAt dueHasTime durationMinutes workspaceId projectId updatedAt").lean();
  return docs
    .filter((t) => !t.projectId || liveProjects.has(String(t.projectId)))
    .map((t) => ({
      id: String(t._id), title: t.title, description: t.description ?? null, dueAt: t.dueAt!.toISOString(), dueHasTime: Boolean(t.dueHasTime),
      durationMinutes: t.durationMinutes ?? null, workspaceId: String(t.workspaceId), updatedAt: t.updatedAt,
    }));
}

type ScopedTask = SyncTask & { workspaceId: string; updatedAt: Date };

export type SyncOutcome = { pulled: number; pushed: number; removed: number };

/**
 * One two-way pass for a connection: read what changed in the calendar and
 * apply it to the tasks, then write the tasks' current state to the calendar.
 * Edits on both sides since the last pass: the later one wins.
 */
export async function syncConnection(connectionId: Types.ObjectId | string): Promise<SyncOutcome | null> {
  return withDb(async () => {
    const now = new Date();
    const connection = await CalendarConnection.findOneAndUpdate(
      { _id: new Types.ObjectId(String(connectionId)), $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }] },
      { $set: { lockedUntil: new Date(now.getTime() + LOCK_MS) } },
      { returnDocument: "after" },
    );
    if (!connection) return null;
    const api = CALENDAR_APIS[connection.provider as SyncProviderId];
    const outcome: SyncOutcome = { pulled: 0, pushed: 0, removed: 0 };
    try {
      const token = await accessToken(connection);
      const user = await FlowUser.findById(connection.userId).select("profile.timezone").lean();
      const timeZone = user?.profile?.timezone || "UTC";
      const userId = String(connection.userId);

      // The Flow calendar, made again if someone deleted it (and everything starts over).
      let calendarId = connection.calendarId;
      let syncState = connection.syncState;
      if (!calendarId || !await api.calendarExists(token, calendarId)) {
        calendarId = await api.createCalendar(token, timeZone);
        syncState = null;
        await CalendarEventLink.deleteMany({ connectionId: connection._id });
      }

      const tasks = new Map<string, ScopedTask>((await tasksInScope(connection.userId)).map((t) => [t.id, t]));
      const links = await CalendarEventLink.find({ connectionId: connection._id });
      const byEvent = new Map(links.map((link) => [link.eventId, link]));
      const byTask = new Map(links.map((link) => [String(link.taskId), link]));
      const url = (task: ScopedTask) => `${appOrigin()}/w/${task.workspaceId}/t/${task.id}`;
      const sync = providerFor(userId);

      // Pull: the calendar's changes to Flow's events.
      const changes = await api.changes(token, calendarId, syncState ?? null, timeZone);
      for (const event of changes.events) {
        const link = byEvent.get(event.id);
        if (!link) continue; // Not one of Flow's events.
        const task = tasks.get(String(link.taskId));
        if (event.deleted) {
          // Deleting the event takes the task off the calendar: its date is cleared, the task stays.
          if (task) {
            try {
              await sync.updateTask(task.id, { dueAt: null, dueHasTime: false });
              outcome.pulled += 1;
            } catch { /* can't edit it any more; leave it */ }
            tasks.delete(task.id);
          }
          await link.deleteOne();
          byTask.delete(String(link.taskId));
          continue;
        }
        if (!task || remoteFingerprint(event) === link.fingerprint) continue;
        // Both sides changed since the last pass: keep whichever changed last.
        const taskChanged = fingerprint(taskToEvent(task, timeZone, url(task))) !== link.fingerprint;
        if (taskChanged && event.updatedAt && task.updatedAt.getTime() > Date.parse(event.updatedAt)) continue;
        const patch = taskPatchFromEvent(event, task, timeZone);
        if (!Object.keys(patch).length) {
          link.fingerprint = remoteFingerprint(event);
          await link.save();
          continue;
        }
        try {
          const updated = await sync.updateTask(task.id, patch);
          const next: ScopedTask = { ...task, title: updated.title, dueAt: updated.dueAt ?? task.dueAt, dueHasTime: updated.dueHasTime, durationMinutes: updated.durationMinutes ?? null, updatedAt: new Date() };
          tasks.set(task.id, next);
          link.fingerprint = fingerprint(taskToEvent(next, timeZone, url(next)));
          link.syncedAt = new Date();
          await link.save();
          outcome.pulled += 1;
        } catch {
          // No permission to edit it (a viewer now, say): the push below puts the event back.
        }
      }

      // Push: every task in scope, as it is now.
      let writes = 0;
      for (const task of tasks.values()) {
        if (writes >= MAX_WRITES) break;
        const event = taskToEvent(task, timeZone, url(task));
        const print = fingerprint(event);
        const link = byTask.get(task.id);
        if (link && link.fingerprint === print) continue;
        writes += 1;
        if (link) {
          try {
            await api.updateEvent(token, calendarId, link.eventId, event);
          } catch (error) {
            if (!(error instanceof CalendarApiError && error.status === 404)) throw error;
            link.eventId = await api.createEvent(token, calendarId, event);
          }
          link.fingerprint = print;
          link.syncedAt = new Date();
          await link.save();
        } else {
          const eventId = await api.createEvent(token, calendarId, event);
          await CalendarEventLink.create({ connectionId: connection._id, taskId: new Types.ObjectId(task.id), eventId, fingerprint: print, syncedAt: new Date() });
        }
        outcome.pushed += 1;
      }

      // Tasks that left the calendar (done, undated, deleted, reassigned): their events go.
      for (const [taskId, link] of byTask) {
        if (tasks.has(taskId) || writes >= MAX_WRITES) continue;
        writes += 1;
        await api.deleteEvent(token, calendarId, link.eventId);
        await link.deleteOne();
        outcome.removed += 1;
      }

      await CalendarConnection.updateOne({ _id: connection._id }, { $set: {
        calendarId, syncState: changes.state || null, lastSyncedAt: new Date(), lastError: null, lockedUntil: null,
      } });
      return outcome;
    } catch (error) {
      const message = error instanceof CalendarApiError && error.status === 401
        ? "The calendar account needs reconnecting."
        : error instanceof Error ? error.message.slice(0, 300) : "Sync failed";
      await CalendarConnection.updateOne({ _id: connection._id }, { $set: { lastError: message, lockedUntil: null } });
      throw error;
    }
  });
}
