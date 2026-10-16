import { createHash, randomBytes } from "node:crypto";
import { Types } from "mongoose";
import { withDb } from "@/src/server/db/mongodb";
import { FlowUser, Project, Task, Workspace, WorkspaceMembership } from "@/src/server/models";
import { buildCalendar, type FeedTask } from "@/src/server/calendar/ics";

/** Done tasks older than this drop off the calendar. */
const PAST_DAYS = 90;
const MAX_EVENTS = 2000;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function appOrigin() {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.AUTH_URL;
  if (!base) throw new Error("App origin is not configured");
  return new URL(base).origin;
}

export function feedUrl(token: string) {
  return `${appOrigin()}/api/calendar/${token}.ics`;
}

export type CalendarFeedStatus = { enabled: boolean; createdAt: string | null };

export async function getFeedStatus(userId: string): Promise<CalendarFeedStatus> {
  return withDb(async () => {
    const user = await FlowUser.findById(userId).select("calendarFeed").lean();
    const createdAt = user?.calendarFeed?.tokenHash ? user.calendarFeed.createdAt : null;
    return { enabled: Boolean(createdAt), createdAt: createdAt?.toISOString() ?? null };
  });
}

/** Creates the link, or replaces it: the old one stops working at once. */
export async function rotateFeed(userId: string) {
  return withDb(async () => {
    const token = randomBytes(32).toString("base64url");
    const createdAt = new Date();
    await FlowUser.updateOne(
      { _id: new Types.ObjectId(userId) },
      { $set: { "calendarFeed.tokenHash": hashToken(token), "calendarFeed.createdAt": createdAt } },
    );
    return { url: feedUrl(token), createdAt: createdAt.toISOString() };
  });
}

export async function disableFeed(userId: string) {
  return withDb(async () => {
    await FlowUser.updateOne(
      { _id: new Types.ObjectId(userId) },
      { $set: { "calendarFeed.tokenHash": null, "calendarFeed.createdAt": null } },
    );
  });
}

/**
 * The calendar behind a feed link, or null for an unknown or revoked one.
 * It holds tasks with a due date that are assigned to the person, plus
 * unassigned ones they created, across every workspace they're still in.
 */
export async function renderFeed(token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return withDb(async () => {
    const user = await FlowUser.findOne({ "calendarFeed.tokenHash": hashToken(token) })
      .select("_id profile.timezone")
      .lean();
    if (!user) return null;

    const memberships = await WorkspaceMembership.find({ userId: user._id }).select("workspaceId").lean();
    const workspaceIds = memberships.map((membership) => membership.workspaceId);
    const [workspaces, projects] = await Promise.all([
      Workspace.find({ _id: { $in: workspaceIds } }).select("name").lean(),
      Project.find({ workspaceId: { $in: workspaceIds }, deletedAt: null }).select("name").lean(),
    ]);
    const workspaceName = new Map(workspaces.map((w) => [String(w._id), w.name]));
    const projectName = new Map(projects.map((p) => [String(p._id), p.name]));

    const tasks = await Task.find({
      workspaceId: { $in: workspaceIds },
      deletedAt: null,
      status: { $ne: "canceled" },
      dueAt: { $gte: new Date(Date.now() - PAST_DAYS * 86_400_000) },
      $or: [
        { assigneeIds: user._id },
        { createdById: user._id, "assigneeIds.0": { $exists: false } },
      ],
    })
      .sort({ dueAt: 1 })
      .limit(MAX_EVENTS)
      .select("title description dueAt dueHasTime durationMinutes status updatedAt workspaceId projectId")
      .lean();

    const origin = appOrigin();
    const events: FeedTask[] = tasks.flatMap((task) => {
      const projectId = task.projectId ? String(task.projectId) : null;
      // Tasks of deleted projects are hidden everywhere else too.
      if (projectId && !projectName.has(projectId)) return [];
      const base = projectId ? `/w/${task.workspaceId}/p/${projectId}` : `/w/${task.workspaceId}/inbox`;
      return [{
        id: String(task._id),
        title: task.title,
        description: task.description ?? null,
        dueAt: task.dueAt!,
        hasTime: Boolean(task.dueHasTime),
        durationMinutes: task.durationMinutes ?? null,
        done: task.status === "done",
        updatedAt: task.updatedAt,
        where: `${projectId ? projectName.get(projectId) : "Inbox"} · ${workspaceName.get(String(task.workspaceId)) ?? "Workspace"}`,
        url: `${origin}${base}?task=${task._id}`,
      }];
    });

    return buildCalendar({
      name: "Noirly Flow",
      timeZone: user.profile?.timezone || "UTC",
      host: new URL(origin).host,
      tasks: events,
    });
  });
}
