import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";

const indiaDay = (date: Date) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
}).format(date);

/** "2026-10-16" for an all-day due date, "2026-10-16 15:30" for a timed one, India time. */
export const indiaDue = (date: Date, hasTime: boolean) => hasTime
  ? `${indiaDay(date)} ${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(date)}`
  : indiaDay(date);

/**
 * The task's lasting link (/w/:id/t/:taskId, which still works after the task
 * moves), refusing anything but this app's own http(s) origin.
 */
export function taskMailUrl(task: { _id: unknown; workspaceId: unknown }) {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.AUTH_URL;
  if (!base) throw new Error("Mail origin missing");
  const url = new URL(`/w/${task.workspaceId}/t/${task._id}`, base);
  if (!["http:", "https:"].includes(url.protocol) || (process.env.NODE_ENV === "production" && url.protocol !== "https:" && !process.env.TASK_EMAIL_OUTBOX)) {
    throw new Error("Invalid mail origin");
  }
  return url;
}

/**
 * Sends one task email: to TASK_EMAIL_OUTBOX as a JSON file when set (tests),
 * otherwise over SMTP. `key` makes the message id, so a retry is recognisable.
 */
export async function sendTaskMail(mail: { to: string; subject: string; text: string; url: URL; key: string }) {
  const subject = mail.subject.replace(/[\r\n]+/g, " ").slice(0, 200);
  const outbox = process.env.TASK_EMAIL_OUTBOX;
  if (outbox) {
    await mkdir(outbox, { recursive: true });
    await writeFile(path.join(outbox, `${mail.key}.json`), JSON.stringify({ to: mail.to, subject, text: mail.text, url: mail.url.href }, null, 2));
    return;
  }
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE, EMAIL_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !EMAIL_FROM) throw new Error("SMTP missing");
  const transport = nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT), secure: SMTP_SECURE === "true", auth: { user: SMTP_USER, pass: SMTP_PASS }, connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10_000 });
  try { await transport.sendMail({ from: EMAIL_FROM, to: mail.to, subject, text: mail.text, messageId: `<task-${mail.key}@noirly-flow.invalid>` }); }
  finally { transport.close(); }
}
