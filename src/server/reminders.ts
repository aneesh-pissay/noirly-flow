import "server-only";
import { after } from "next/server";
import { withDb } from "@/src/server/db/mongodb";
import { FlowUser, Task, WorkspaceMembership } from "@/src/server/models";
import { notify } from "@/src/server/notifications";
import { indiaDue, sendTaskMail, taskMailUrl } from "@/src/server/mail/send-task-mail";

/** Reminders more than this late are dropped rather than sent hours after the fact. */
const STALE_MS = 6 * 60 * 60_000;
const BATCH = 50;

/**
 * Sends every reminder that is due: an in-app notification and an email to
 * each assignee, or to the creator when nobody is assigned. Each task is
 * claimed by setting reminderSentAt first, so overlapping sweeps (several
 * server instances, cron plus polls) never send one twice. Email is best
 * effort; the in-app notification is the record.
 */
export async function deliverDueReminders(now = new Date()) {
  return withDb(async () => {
    let sent = 0;
    for (let i = 0; i < BATCH; i += 1) {
      const task = await Task.findOneAndUpdate(
        {
          deletedAt: null,
          status: { $nin: ["done", "canceled"] },
          reminderSentAt: null,
          reminderAt: { $lte: now, $gte: new Date(now.getTime() - STALE_MS) },
        },
        { $set: { reminderSentAt: now } },
        { sort: { reminderAt: 1 }, new: true, timestamps: false },
      ).lean();
      if (!task) break;
      const recipientIds = task.assigneeIds?.length ? task.assigneeIds : [task.createdById];
      await notify({
        workspaceId: task.workspaceId,
        taskId: task._id,
        actorId: String(task.createdById),
        kind: "reminder",
        recipientIds,
        includeActor: true,
      });
      try {
        const members = await WorkspaceMembership.find({ workspaceId: task.workspaceId, userId: { $in: recipientIds } }).select("userId").lean();
        const people = await FlowUser.find({ _id: { $in: members.map((m) => m.userId) } }).select("email").lean();
        const url = taskMailUrl(task);
        const due = task.dueAt ? indiaDue(task.dueAt, true) : "";
        for (const person of people) {
          if (!person.email) continue;
          await sendTaskMail({
            to: person.email,
            subject: `Reminder: ${task.title}`,
            text: `A reminder from Noirly Flow.\n\n${task.title}\nDue: ${due} (India time)\n\nOpen the task: ${url.href}`,
            url,
            key: `${task._id}-${person._id}-reminder-${task.reminderAt?.getTime()}`,
          });
        }
      } catch {
        console.error("Reminder email failed; the in-app reminder was still sent.");
      }
      sent += 1;
    }
    return { sent };
  });
}

let lastSweep = 0;

/**
 * Runs a sweep after the current response, at most every 30 seconds per server
 * instance. Called from the notification poll every open Flow tab makes once a
 * minute, so reminders go out on time without a per-minute cron (which the
 * Vercel Hobby plan doesn't allow). /api/cron/due-reminders covers the times
 * nobody has Flow open, when something calls it on a schedule.
 */
export function scheduleDueReminders() {
  const now = Date.now();
  if (now - lastSweep < 30_000) return;
  lastSweep = now;
  after(async () => {
    try { await deliverDueReminders(); }
    catch { console.error("Reminder sweep failed; due reminders will go out on the next one."); }
  });
}
