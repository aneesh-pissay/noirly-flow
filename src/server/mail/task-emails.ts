import "server-only";
import type { QueryFilter } from "mongoose";
import { withDb } from "@/src/server/db/mongodb";
import { FlowUser, Task, WorkspaceMembership, type TaskDocument } from "@/src/server/models";
import { indiaDue, sendTaskMail, taskMailUrl } from "./send-task-mail";

const indiaDay = (date: Date) => indiaDue(date, false);

/** Durable recipient state for assignments, completion and reminders; claims use leases. */
export async function deliverTaskEmails(taskId?: string, reminders = false) {
  return withDb(async () => {
    const started = Date.now();
    const now = new Date();
    const today = indiaDay(now);
    const cutoff = new Date(`${today}T00:00:00+05:30`);
    const active: QueryFilter<TaskDocument> = { deletedAt: null, status: { $nin: ["done", "canceled"] } };
    const taskFilter: QueryFilter<TaskDocument> = {
      deletedAt: null,
      ...(taskId ? { _id: taskId } : {}),
      $or: [
        { ...active, "emailDeliveries.assignmentPending": true },
        { status: "done", "completionDeliveries.pending": true },
        ...(reminders ? [{ ...active, dueAt: { $ne: null, $lt: cutoff }, "assigneeIds.0": { $exists: true } }] : []),
      ],
    };
    const cursor = Task.find(taskFilter).sort({ emailCheckedAt: 1, _id: 1 }).lean().cursor();
    let attempted = 0;
    let delivered = 0;
    let more = false;
    try {
      for await (const snapshot of cursor) {
        if (Date.now() - started > 35_000 || attempted >= 50) { more = true; break; }
        // Existing tasks join reminders without sending historical assignment emails.
        for (const userId of snapshot.status === "done" ? [] : snapshot.assigneeIds) {
          if (snapshot.emailDeliveries?.some((job) => String(job.userId) === String(userId))) continue;
          await Task.updateOne({ _id: snapshot._id, assigneeIds: userId, "emailDeliveries.userId": { $ne: userId } }, {
            $push: { emailDeliveries: { userId, assignmentPending: false, remindedOn: "", nextAttemptAt: new Date(0), lockedUntil: new Date(0), attempts: 0 } },
          }, { timestamps: false });
        }
        const task = await Task.findById(snapshot._id).lean();
        if (!task) continue;
        const jobs = task.status === "done"
          ? (task.completionDeliveries ?? []).map((job) => ({ ...job, assignmentPending: job.pending, remindedOn: "", completion: true }))
          : (task.emailDeliveries ?? []).map((job) => ({ ...job, completion: false }));
        for (const job of jobs) {
          if (Date.now() - started > 35_000 || attempted >= 50) { more = true; break; }
          const overdue = !job.completion && reminders && task.dueAt && task.dueAt < cutoff && job.remindedOn !== today;
          if ((!job.assignmentPending && !overdue) || job.nextAttemptAt > now || job.lockedUntil > now) continue;
          const lease = new Date(Date.now() + 300_000);
          const field = job.completion ? "completionDeliveries" : "emailDeliveries";
          const pendingField = job.completion ? "pending" : "assignmentPending";
          const eligible: QueryFilter<TaskDocument> = job.completion
            ? { deletedAt: null, status: "done", $or: [{ createdById: job.userId }, { assigneeIds: job.userId }] }
            : { ...active, assigneeIds: job.userId };
          const claim = await Task.updateOne({
            _id: task._id, ...eligible,
            ...(!job.assignmentPending ? { dueAt: { $ne: null, $lt: cutoff } } : {}),
            [field]: { $elemMatch: {
              _id: job._id, lockedUntil: { $lte: now }, nextAttemptAt: { $lte: now },
              ...(job.assignmentPending ? { [pendingField]: true } : { remindedOn: { $ne: today } }),
            } },
          }, { $set: { [`${field}.$[delivery].lockedUntil`]: lease }, $inc: { [`${field}.$[delivery].attempts`]: 1 } }, {
            timestamps: false, arrayFilters: [{ "delivery._id": job._id }],
          });
          if (!claim.modifiedCount) continue;
          attempted++;
          const filter = { _id: task._id, [field]: { $elemMatch: { _id: job._id, lockedUntil: lease } } };
          const deliveryOptions = { timestamps: false, arrayFilters: [{ "delivery._id": job._id, "delivery.lockedUntil": lease }] };
          try {
            const [current, recipient, member] = await Promise.all([
              Task.findOne({ _id: task._id, ...eligible, [`${field}._id`]: job._id }).lean(),
              FlowUser.findById(job.userId).select("email").lean(),
              WorkspaceMembership.exists({ workspaceId: task.workspaceId, userId: job.userId }),
            ]);
            const stillOverdue = !!(!job.completion && reminders && current?.dueAt && current.dueAt < cutoff);
            if (current && recipient && member && (job.assignmentPending || stillOverdue)) {
              const url = taskMailUrl(current);
              const subject = `${job.completion ? "Task completed" : job.assignmentPending ? "Task assigned to you" : "Overdue task reminder"}: ${current.title}`.replace(/[\r\n]+/g, " ").slice(0, 200);
              const text = job.completion
                ? `This task has been completed in Noirly Flow.\n\n${current.title}\n\nYou received this email because you created this task or are assigned to it.\nOverdue reminders have stopped.\n\nOpen the task: ${url.href}`
                : `${job.assignmentPending ? "You have been assigned a task in Noirly Flow." : "This task is overdue and still needs your attention."}\n\n${current.title}\nDue: ${current.dueAt ? indiaDue(current.dueAt, Boolean(current.dueHasTime)) + " (India time)" : "Not set"}\n${stillOverdue ? "This task is overdue.\n" : ""}\nOpen the task: ${url.href}\n\nDaily overdue reminders stop when the task is completed, canceled, deleted, or you are unassigned.`;
              const key = `${current._id}-${job._id}-${job.completion ? "completed" : job.assignmentPending ? "assigned" : today}`;
              await sendTaskMail({ to: recipient.email, subject, text, url, key });
              delivered++;
            }
            await Task.updateOne(filter, { $set: {
              [`${field}.$[delivery].${pendingField}`]: false,
              [`${field}.$[delivery].lockedUntil`]: new Date(0),
              [`${field}.$[delivery].nextAttemptAt`]: new Date(0),
              [`${field}.$[delivery].attempts`]: 0,
              ...(stillOverdue ? { "emailDeliveries.$[delivery].remindedOn": today } : {}),
            } }, deliveryOptions);
          } catch {
            await Task.updateOne(filter, { $set: {
              [`${field}.$[delivery].lockedUntil`]: new Date(0),
              [`${field}.$[delivery].nextAttemptAt`]: new Date(Date.now() + Math.min(24 * 60, 5 * 2 ** Math.min(job.attempts, 8)) * 60_000),
            } }, deliveryOptions);
            console.error("Task email deferred; check SMTP configuration and retry worker.");
          }
        }
        await Task.updateOne({ _id: task._id }, { $set: { emailCheckedAt: new Date() } }, { timestamps: false });
        if (more) break;
      }
    } finally { await cursor.close(); }
    return { delivered, attempted, more };
  });
}
