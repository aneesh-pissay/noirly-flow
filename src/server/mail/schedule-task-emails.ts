import "server-only";
import { after } from "next/server";
import { deliverTaskEmails } from "./task-emails";

export function scheduleTaskEmails(taskId?: string) {
  after(async () => {
    try { await deliverTaskEmails(taskId); }
    catch { console.error("Task email worker failed; queued mail will be retried."); }
  });
}
