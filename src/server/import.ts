import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Project, Section, Tag } from "@/src/server/models";
import { createMongoSyncProvider } from "@/src/server/providers/mongo-sync-provider";
import { createSection } from "@/src/server/sections";
import { listMembers, requireWorkspaceRole } from "@/src/server/workspace/members";
import { MAX_IMPORT_TASKS, type ImportTask } from "@/src/core/import";

export type ImportResult = {
  created: number;
  sectionsCreated: number;
  tagsCreated: number;
  failed: Array<{ index: number; title: string; error: string }>;
  /** Emails that didn't match a member; those tasks were left unassigned. */
  unknownAssignees: string[];
};

const key = (name: string) => name.trim().toLowerCase();

/**
 * Creates an import plan's tasks in a project, in order, as `userId`.
 * Missing sections and tags are made; assignees are matched by email.
 * It goes straight to the provider, so automations and webhooks don't fire
 * once per imported row.
 */
export async function runImport(userId: string, projectId: string, tasks: ImportTask[]): Promise<ImportResult> {
  if (tasks.length > MAX_IMPORT_TASKS) throw new ApiError(400, "too_many", `Up to ${MAX_IMPORT_TASKS} tasks per import`);
  const project = await withDb(() => Project.findOne({ _id: new Types.ObjectId(projectId), deletedAt: null }).select("workspaceId").lean());
  if (!project) throw new ApiError(404, "not_found", "Project not found");
  const workspaceId = String(project.workspaceId);
  await withDb(() => requireWorkspaceRole(userId, workspaceId, "member"));
  const sync = createMongoSyncProvider({ userId });

  // Sections by name, making the missing ones.
  const sectionIds = new Map<string, string>();
  for (const section of await withDb(() => Section.find({ projectId: project._id }).select("name").lean())) sectionIds.set(key(section.name), String(section._id));
  let sectionsCreated = 0;
  for (const name of new Set(tasks.map((t) => t.sectionName?.trim()).filter((n): n is string => Boolean(n)))) {
    if (sectionIds.has(key(name))) continue;
    const made = await createSection(userId, projectId, name.slice(0, 60));
    sectionIds.set(key(name), made.id);
    sectionsCreated += 1;
  }

  // Tags by name, likewise.
  const tagIds = new Map<string, string>();
  for (const tag of await withDb(() => Tag.find({ workspaceId: project.workspaceId }).select("name").lean())) tagIds.set(key(tag.name), String(tag._id));
  let tagsCreated = 0;
  for (const name of new Set(tasks.flatMap((t) => t.tagNames.map((n) => n.trim())).filter(Boolean))) {
    if (tagIds.has(key(name))) continue;
    const made = await sync.createTag(workspaceId, { name: name.slice(0, 40) });
    tagIds.set(key(name), made.id);
    tagsCreated += 1;
  }

  const members = new Map((await listMembers(workspaceId)).map((m) => [m.email.toLowerCase(), m.userId]));
  const unknownAssignees = new Set<string>();
  const created: Array<string | null> = [];
  const failed: ImportResult["failed"] = [];
  for (const [index, task] of tasks.entries()) {
    const assignee = task.assigneeEmail ? members.get(task.assigneeEmail.toLowerCase()) : undefined;
    if (task.assigneeEmail && !assignee) unknownAssignees.add(task.assigneeEmail);
    try {
      const made = await sync.createTask({
        workspaceId,
        projectId,
        title: task.title,
        description: task.description,
        priority: task.priority,
        status: task.done ? "done" : "todo",
        dueAt: task.dueAt,
        dueHasTime: task.dueHasTime,
        // A finished task doesn't repeat.
        recurrence: task.done ? null : task.recurrence,
        tagIds: [...new Set(task.tagNames.map((n) => tagIds.get(key(n))).filter((id): id is string => Boolean(id)))],
        sectionId: task.sectionName ? sectionIds.get(key(task.sectionName)) ?? null : null,
        assigneeIds: assignee ? [assignee] : [],
        parentTaskId: task.parent !== null ? created[task.parent] ?? null : null,
      });
      created.push(made.id);
      for (const body of task.comments) await sync.createComment({ taskId: made.id, body: body.slice(0, 10_000) });
    } catch (error) {
      created.push(null);
      failed.push({ index, title: task.title, error: error instanceof Error ? error.message : "Couldn't create it" });
    }
  }
  return { created: created.filter(Boolean).length, sectionsCreated, tagsCreated, failed, unknownAssignees: [...unknownAssignees] };
}
