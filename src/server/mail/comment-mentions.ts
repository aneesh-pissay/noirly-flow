import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import { withDb } from "@/src/server/db/mongodb";
import { Comment, FlowUser, Task, WorkspaceMembership } from "@/src/server/models";
import { resolveFlowDisplayName } from "@/src/server/users/display-name";

/** Jobs live in the comment document, so saving a comment also durably queues its mail. */
export async function deliverCommentMentions(commentId?: string) {
  return withDb(async () => {
    const started = Date.now();
    const now = new Date();
    const ready = { status: { $in: ["pending", "sending"] }, nextAttemptAt: { $lte: now }, lockedUntil: { $lte: now } };
    const comments = await Comment.find({
      ...(commentId ? { _id: commentId } : {}), deletedAt: null,
      mentionDeliveries: { $elemMatch: ready },
    }).sort({ "mentionDeliveries.nextAttemptAt": 1 }).limit(20).lean();
    let delivered = 0;
    let attempted = 0;
    for (const comment of comments) {
      for (const job of comment.mentionDeliveries ?? []) {
        if (attempted >= 50 || Date.now() - started > 40_000) return { delivered, attempted };
        if (!["pending", "sending"].includes(job.status ?? "") || job.nextAttemptAt > now || job.lockedUntil > now) continue;
        const claim = await Comment.updateOne({
          _id: comment._id, deletedAt: null,
          mentionDeliveries: { $elemMatch: { ...ready, userId: job.userId } },
        }, {
          $set: { "mentionDeliveries.$.status": "sending", "mentionDeliveries.$.lockedUntil": new Date(Date.now() + 300_000) },
          $inc: { "mentionDeliveries.$.attempts": 1 },
        });
        if (!claim.modifiedCount) continue;
        attempted++;
        const filter = { _id: comment._id, "mentionDeliveries.userId": job.userId };
        try {
          const [member, recipient, author, task] = await Promise.all([
            WorkspaceMembership.exists({ workspaceId: comment.workspaceId, userId: job.userId }),
            FlowUser.findById(job.userId).select("email").lean(),
            FlowUser.findById(comment.authorId).select("displayName profile.displayName").lean(),
            Task.findOne({ _id: comment.taskId, workspaceId: comment.workspaceId, deletedAt: null }).select("title projectId").lean(),
          ]);
          if (!member || !recipient || !task) {
            await Comment.updateOne(filter, { $set: { "mentionDeliveries.$.status": "skipped" } });
            continue;
          }
          const base = process.env.NEXT_PUBLIC_APP_URL || process.env.AUTH_URL;
          if (!base) throw new Error("Mail origin is not configured");
          const url = new URL(`/w/${comment.workspaceId}/${task.projectId ? `p/${task.projectId}` : "inbox"}?task=${task._id}#comment-${comment._id}`, base);
          if (!['http:', 'https:'].includes(url.protocol) || (process.env.NODE_ENV === 'production' && url.protocol !== 'https:' && !process.env.MENTION_EMAIL_OUTBOX)) throw new Error("Invalid mail origin");
          const authorName = resolveFlowDisplayName(author);
          const subject = `${authorName} mentioned you in ${task.title}`.replace(/[\r\n]+/g, ' ').slice(0, 200);
          const text = `${authorName} tagged you in a Noirly Flow task comment.\n\n${task.title}\n\n${comment.body}\n\nOpen the task: ${url.href}\n\nSign in with the account that belongs to this workspace.`;
          const outbox = process.env.MENTION_EMAIL_OUTBOX;
          if (outbox) {
            await mkdir(outbox, { recursive: true });
            await writeFile(path.join(outbox, `${comment._id}-${job.userId}.json`), JSON.stringify({ to: recipient.email, subject, text, url: url.href }, null, 2));
          } else {
            const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM, SMTP_SECURE } = process.env;
            if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !EMAIL_FROM) throw new Error("SMTP is not configured");
            const mail = nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT), secure: SMTP_SECURE === "true", auth: { user: SMTP_USER, pass: SMTP_PASS }, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000 });
            try {
              await mail.sendMail({ from: EMAIL_FROM, to: recipient.email, subject, text, messageId: `<mention-${comment._id}-${job.userId}@noirly-flow.invalid>` });
            } finally { mail.close(); }
          }
          await Comment.updateOne(filter, { $set: { "mentionDeliveries.$.status": "sent", "mentionDeliveries.$.lockedUntil": new Date(0) } });
          delivered++;
        } catch {
          await Comment.updateOne(filter, { $set: {
            "mentionDeliveries.$.status": "pending", "mentionDeliveries.$.lockedUntil": new Date(0),
            "mentionDeliveries.$.nextAttemptAt": new Date(Date.now() + Math.min(24 * 60, 5 * 2 ** Math.min(job.attempts ?? 0, 8)) * 60_000),
          } });
          console.error("Comment mention email deferred; check mail configuration and retry worker.");
        }
      }
    }
    return { delivered, attempted };
  });
}
