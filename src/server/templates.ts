import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Project, Section, Tag, Task, Template, WorkspaceMembership, type TemplateDocument } from "@/src/server/models";
import { createSection } from "@/src/server/sections";
import { MAX_SUBTASK_DEPTH } from "@/src/server/subtasks";
import { countTemplateTasks, type Template as TemplateDto, type TemplateTask } from "@/src/core/templates";
import type { MemberRole } from "@/src/core/models/enums";
import type { SyncProvider, Task as TaskDto } from "@/src/core/sync/types";

const MAX_TEMPLATES = 100;
/** Tasks in one template, subtasks included. */
export const MAX_TEMPLATE_TASKS = 200;
const RANK: Record<MemberRole, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };

function map(doc: TemplateDocument): TemplateDto {
  return {
    id: String(doc._id),
    workspaceId: String(doc.workspaceId),
    kind: doc.kind,
    name: doc.name,
    data: doc.data,
    createdAt: doc.createdAt.toISOString(),
  } as TemplateDto;
}

async function requireRole(userId: string, workspaceId: Types.ObjectId, minRole: MemberRole) {
  const membership = await WorkspaceMembership.findOne({ workspaceId, userId: new Types.ObjectId(userId) }).select("role").lean();
  if (!membership) throw new ApiError(403, "forbidden", "Not a member of this workspace");
  if (RANK[membership.role as MemberRole] < RANK[minRole]) throw new ApiError(403, "forbidden", "You can't change templates here");
}

type TaskRow = { _id: Types.ObjectId; title: string; description?: string | null; priority: TemplateTask["priority"]; durationMinutes?: number | null; tagIds?: Types.ObjectId[]; sectionId?: Types.ObjectId | null };

function toTemplateTask(task: TaskRow, children: Map<string, TaskRow[]>, sectionIndex: Map<string, number> | null, depth: number): TemplateTask {
  const subtasks = depth < MAX_SUBTASK_DEPTH ? (children.get(String(task._id)) ?? []) : [];
  return {
    title: task.title,
    description: task.description ?? null,
    priority: task.priority ?? "none",
    durationMinutes: task.durationMinutes ?? null,
    tagIds: (task.tagIds ?? []).map(String),
    ...(sectionIndex ? { sectionIndex: task.sectionId ? sectionIndex.get(String(task.sectionId)) ?? null : null } : {}),
    ...(subtasks.length ? { subtasks: subtasks.map((child) => toTemplateTask(child, children, null, depth + 1)) } : {}),
  };
}

/** Open (todo / in progress) tasks below `rootIds`, grouped by parent. */
async function openSubtrees(rootIds: Types.ObjectId[]) {
  const children = new Map<string, TaskRow[]>();
  let frontier = rootIds;
  for (let level = 0; frontier.length && level < MAX_SUBTASK_DEPTH; level += 1) {
    const rows = await Task.find({ parentTaskId: { $in: frontier }, deletedAt: null, status: { $in: ["todo", "in_progress"] } })
      .sort({ position: 1, createdAt: 1 }).select("title description priority durationMinutes tagIds parentTaskId").lean();
    for (const row of rows) {
      const key = String(row.parentTaskId);
      children.set(key, [...(children.get(key) ?? []), row as TaskRow]);
    }
    frontier = rows.map((row) => row._id);
  }
  return children;
}

async function store(userId: string, workspaceId: Types.ObjectId, kind: "task" | "project", name: string, data: unknown, size: number) {
  if (size > MAX_TEMPLATE_TASKS) throw new ApiError(400, "too_large", `A template can hold up to ${MAX_TEMPLATE_TASKS} tasks.`);
  if (await Template.countDocuments({ workspaceId }) >= MAX_TEMPLATES) {
    throw new ApiError(400, "limit_reached", `A workspace can keep up to ${MAX_TEMPLATES} templates.`);
  }
  const doc = await Template.create({ workspaceId, kind, name, data, createdById: new Types.ObjectId(userId) });
  return map(doc.toObject());
}

/** A task and its open subtasks, as a template. */
export function saveTaskTemplate(userId: string, workspaceId: string, taskId: string, name: string) {
  return withDb(async () => {
    const ws = new Types.ObjectId(workspaceId);
    await requireRole(userId, ws, "member");
    const task = await Task.findOne({ _id: new Types.ObjectId(taskId), workspaceId: ws, deletedAt: null })
      .select("title description priority durationMinutes tagIds").lean();
    if (!task) throw new ApiError(404, "not_found", "Task not found");
    const children = await openSubtrees([task._id]);
    const root = toTemplateTask(task as TaskRow, children, null, 0);
    return store(userId, ws, "task", name, { task: root }, countTemplateTasks([root]));
  });
}

/** A project's sections and its open tasks with their subtasks, as a template. */
export function saveProjectTemplate(userId: string, workspaceId: string, projectId: string, name: string) {
  return withDb(async () => {
    const ws = new Types.ObjectId(workspaceId);
    await requireRole(userId, ws, "member");
    const project = await Project.findOne({ _id: new Types.ObjectId(projectId), workspaceId: ws, deletedAt: null }).select("_id").lean();
    if (!project) throw new ApiError(404, "not_found", "Project not found");
    const sections = await Section.find({ projectId: project._id }).sort({ position: 1, createdAt: 1 }).lean();
    const sectionIndex = new Map(sections.map((section, index) => [String(section._id), index]));
    const roots = await Task.find({ projectId: project._id, parentTaskId: null, deletedAt: null, status: { $in: ["todo", "in_progress"] } })
      .sort({ position: 1, createdAt: 1 }).select("title description priority durationMinutes tagIds sectionId").lean();
    const children = await openSubtrees(roots.map((task) => task._id));
    const tasks = roots.map((task) => toTemplateTask(task as TaskRow, children, sectionIndex, 0));
    return store(userId, ws, "project", name, { sections: sections.map((s) => s.name), tasks }, countTemplateTasks(tasks));
  });
}

export function listTemplates(userId: string, workspaceId: string) {
  return withDb(async () => {
    const ws = new Types.ObjectId(workspaceId);
    await requireRole(userId, ws, "viewer");
    const docs = await Template.find({ workspaceId: ws }).sort({ kind: 1, name: 1 }).lean();
    return docs.map(map);
  });
}

async function requireTemplate(userId: string, templateId: string, minRole: MemberRole) {
  const template = await Template.findById(new Types.ObjectId(templateId)).lean();
  if (!template) throw new ApiError(404, "not_found", "Template not found");
  await requireRole(userId, template.workspaceId, minRole);
  return template;
}

export function deleteTemplate(userId: string, templateId: string) {
  return withDb(async () => {
    const template = await requireTemplate(userId, templateId, "member");
    await Template.deleteOne({ _id: template._id });
  });
}

export type TaskOverrides = Partial<Pick<TaskDto, "title" | "description" | "priority" | "dueAt" | "dueHasTime" | "assigneeIds">>;

/**
 * Makes a template's tasks through the normal task create, so permissions,
 * emails and activity apply. Tags deleted since the template was saved are
 * left off.
 */
async function createTree(
  sync: SyncProvider,
  workspaceId: string,
  nodes: TemplateTask[],
  place: { projectId: string | null; sectionIds: string[]; sectionId?: string | null; parentTaskId?: string | null },
  liveTags: Set<string>,
  rootOverrides?: TaskOverrides,
): Promise<TaskDto[]> {
  const created: TaskDto[] = [];
  for (const node of nodes) {
    const sectionId = place.parentTaskId
      ? null
      : place.sectionId !== undefined ? place.sectionId : node.sectionIndex != null ? place.sectionIds[node.sectionIndex] ?? null : null;
    const task = await sync.createTask({
      workspaceId,
      projectId: place.projectId,
      sectionId,
      parentTaskId: place.parentTaskId ?? null,
      title: node.title,
      description: node.description ?? null,
      priority: node.priority ?? "none",
      durationMinutes: node.durationMinutes ?? null,
      tagIds: (node.tagIds ?? []).filter((id) => liveTags.has(id)),
      ...(rootOverrides ?? {}),
    });
    created.push(task);
    if (node.subtasks?.length) {
      await createTree(sync, workspaceId, node.subtasks, { ...place, parentTaskId: task.id, sectionId: null }, liveTags);
    }
  }
  return created;
}

/** A task template into a project (or the Inbox), optionally with the top task's fields overridden. */
export async function applyTaskTemplate(
  sync: SyncProvider,
  userId: string,
  templateId: string,
  input: { projectId: string | null; sectionId?: string | null; overrides?: TaskOverrides },
) {
  const template = await withDb(() => requireTemplate(userId, templateId, "member"));
  if (template.kind !== "task") throw new ApiError(400, "invalid_request", "That's a project template");
  const liveTags = await withDb(async () => new Set((await Tag.find({ workspaceId: template.workspaceId }).select("_id").lean()).map((t) => String(t._id))));
  const [task] = await createTree(sync, String(template.workspaceId), [(template.data as { task: TemplateTask }).task],
    { projectId: input.projectId, sectionIds: [], sectionId: input.sectionId ?? null }, liveTags, input.overrides);
  return task!;
}

/** A project template as a new project: its sections, then its tasks in them. */
export async function applyProjectTemplate(sync: SyncProvider, userId: string, templateId: string, input: { name: string }) {
  const template = await withDb(() => requireTemplate(userId, templateId, "member"));
  if (template.kind !== "project") throw new ApiError(400, "invalid_request", "That's a task template");
  const data = template.data as { sections: string[]; tasks: TemplateTask[] };
  const workspaceId = String(template.workspaceId);
  const project = await sync.createProject({ workspaceId, name: input.name });
  const sectionIds: string[] = [];
  for (const name of data.sections) sectionIds.push((await createSection(userId, project.id, name)).id);
  const liveTags = await withDb(async () => new Set((await Tag.find({ workspaceId: template.workspaceId }).select("_id").lean()).map((t) => String(t._id))));
  await createTree(sync, workspaceId, data.tasks, { projectId: project.id, sectionIds }, liveTags);
  return project;
}

/** For exports. */
export { map as mapTemplateDoc };
