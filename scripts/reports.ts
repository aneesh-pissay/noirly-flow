/**
 * Review user reports (comments, tasks, members) filed from Noirly Flow.
 *
 *   npx tsx scripts/reports.ts                         list open reports
 *   npx tsx scripts/reports.ts --all                   list every report
 *   npx tsx scripts/reports.ts --resolve <id> --status actioned|dismissed [--note "…"] [--remove]
 *
 * --remove also hides the reported comment or task (sets deletedAt, as a
 * delete in the app does). For a reported member, remove them from the
 * workspace in the app or ask the workspace owner to. Uses MONGODB_URI from
 * .env.local (or the environment).
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import mongoose from "mongoose";
import { Comment, FlowUser, Report, Task, Workspace } from "@/src/server/models";
import { REPORT_STATUSES, type ReportStatus } from "@/src/server/models/Report";

const envFile = resolve(process.cwd(), ".env.local");
if (existsSync(envFile) && !process.env.MONGODB_URI) process.loadEnvFile(envFile);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function nameOf(userId: unknown): Promise<string> {
  if (!userId) return "—";
  const user = await FlowUser.findById(userId).select("displayName email").lean();
  return user ? `${user.displayName} <${user.email}>` : `(deleted ${String(userId)})`;
}

async function list(all: boolean) {
  const reports = await Report.find(all ? {} : { status: "open" }).sort({ createdAt: 1 }).lean();
  if (reports.length === 0) {
    console.log(all ? "No reports." : "No open reports.");
    return;
  }
  for (const r of reports) {
    const workspace = await Workspace.findById(r.workspaceId).select("name").lean();
    console.log(
      [
        `── ${String(r._id)}  [${r.status}]  ${r.createdAt.toISOString()}`,
        `   ${r.targetType} ${String(r.targetId)} in "${workspace?.name ?? "deleted workspace"}"`,
        `   reason:   ${r.reason}${r.details ? ` — ${r.details}` : ""}`,
        `   reporter: ${await nameOf(r.reporterId)}`,
        `   about:    ${await nameOf(r.targetUserId)}`,
        r.excerpt ? `   content:  ${r.excerpt.replace(/\s+/g, " ").slice(0, 300)}` : null,
        r.resolutionNote ? `   note:     ${r.resolutionNote}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  console.log(`\n${reports.length} report(s).`);
}

async function resolveReport(id: string, status: ReportStatus, note: string | undefined, remove: boolean) {
  const report = await Report.findById(id);
  if (!report) throw new Error(`No report ${id}`);
  if (remove) {
    const now = new Date();
    if (report.targetType === "comment") await Comment.updateOne({ _id: report.targetId }, { $set: { deletedAt: now } });
    else if (report.targetType === "task") await Task.updateOne({ _id: report.targetId }, { $set: { deletedAt: now } });
    else console.log("Members are removed from a workspace in the app, not here.");
  }
  report.status = status;
  report.resolvedAt = new Date();
  report.resolutionNote = note ?? null;
  await report.save();
  console.log(`Report ${id} → ${status}${remove ? " (content removed)" : ""}`);
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required (.env.local or environment).");
  await mongoose.connect(uri);
  const id = arg("resolve");
  if (id) {
    const status = arg("status") as ReportStatus | undefined;
    if (!status || status === "open" || !REPORT_STATUSES.includes(status)) {
      throw new Error("--status must be actioned or dismissed");
    }
    await resolveReport(id, status, arg("note"), flag("remove"));
  } else {
    await list(flag("all"));
  }
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
