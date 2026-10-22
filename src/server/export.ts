import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import {
  AutomationRule, BoardColumn, Comment, Goal, IntakeForm, Project, ProjectField, SavedFilter, Section, Tag,
  Task, TaskAttachment, Template, TimeEntry, Workspace,
} from "@/src/server/models";
import { mapColumn, mapComment, mapProject, mapTag, mapTask, mapWorkspace } from "@/src/server/mappers";
import { listMembers, requireWorkspaceRole } from "@/src/server/workspace/members";
import { mapSectionDoc } from "@/src/server/sections";
import { mapFieldDoc } from "@/src/server/fields";
import { mapRuleDoc } from "@/src/server/automations";
import { mapFormDoc } from "@/src/server/forms";
import { mapFilterDoc } from "@/src/server/filters";
import { mapTemplateDoc } from "@/src/server/templates";
import { EXPORT_FORMAT, EXPORT_VERSION, MAX_EXPORT_TASKS, tasksToCsv } from "@/src/core/export";
import type { Task as TaskDto } from "@/src/core/sync/types";

const oid = (id: string) => new Types.ObjectId(id);
const iso = (date: Date | null | undefined) => (date ? date.toISOString() : null);

async function liveTasks(workspaceId: Types.ObjectId) {
  const count = await Task.countDocuments({ workspaceId, deletedAt: null });
  if (count > MAX_EXPORT_TASKS) {
    throw new ApiError(413, "too_large", `This workspace has ${count} tasks; exports go up to ${MAX_EXPORT_TASKS}.`);
  }
  const docs = await Task.find({ workspaceId, deletedAt: null }).sort({ createdAt: 1 }).lean();
  return docs.map((doc) => mapTask(doc as Parameters<typeof mapTask>[0]));
}

/**
 * Everything in a workspace as one JSON document, for keeping or moving
 * elsewhere. Left out on purpose: trashed tasks, file contents (attachments
 * are listed by name), webhook secrets, access tokens and pending invites.
 */
export async function buildWorkspaceExport(workspaceId: string) {
  return withDb(async () => {
    const ws = oid(workspaceId);
    const workspace = await Workspace.findById(ws).lean();
    if (!workspace) throw new ApiError(404, "not_found", "Workspace not found");
    const projectDocs = await Project.find({ workspaceId: ws, deletedAt: null }).sort({ createdAt: 1 }).lean();
    const projectIds = projectDocs.map((p) => p._id);
    const [members, tasks, columns, sections, fields, rules, forms, tags, goals, filters, templates, comments, time, attachments] = await Promise.all([
      listMembers(workspaceId),
      liveTasks(ws),
      BoardColumn.find({ projectId: { $in: projectIds } }).sort({ position: 1 }).lean(),
      Section.find({ projectId: { $in: projectIds } }).sort({ position: 1 }).lean(),
      ProjectField.find({ projectId: { $in: projectIds } }).sort({ position: 1 }).lean(),
      AutomationRule.find({ projectId: { $in: projectIds } }).sort({ createdAt: 1 }).lean(),
      IntakeForm.find({ projectId: { $in: projectIds } }).sort({ createdAt: 1 }).lean(),
      Tag.find({ workspaceId: ws }).sort({ name: 1 }).lean(),
      Goal.find({ workspaceId: ws }).sort({ createdAt: 1 }).lean(),
      SavedFilter.find({ workspaceId: ws }).lean(),
      Template.find({ workspaceId: ws }).lean(),
      Comment.find({ workspaceId: ws, deletedAt: null }).sort({ createdAt: 1 }).lean(),
      TimeEntry.find({ workspaceId: ws, endedAt: { $ne: null } }).sort({ startedAt: 1 }).lean(),
      TaskAttachment.find({ workspaceId: ws, deletedAt: null }).select("taskId filename mime sizeBytes createdAt").lean(),
    ]);
    const byProject = <T extends { projectId: unknown }>(rows: T[], id: Types.ObjectId) => rows.filter((row) => String(row.projectId) === String(id));
    return {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      workspace: mapWorkspace(workspace as Parameters<typeof mapWorkspace>[0]),
      members: members.map((m) => ({ userId: m.userId, displayName: m.displayName, email: m.email, role: m.role })),
      projects: projectDocs.map((p) => ({
        ...mapProject(p as Parameters<typeof mapProject>[0]),
        columns: byProject(columns, p._id).map((c) => mapColumn(c as Parameters<typeof mapColumn>[0])),
        sections: byProject(sections, p._id).map((s) => mapSectionDoc(s as Parameters<typeof mapSectionDoc>[0])),
        fields: byProject(fields, p._id).map((f) => mapFieldDoc(f as Parameters<typeof mapFieldDoc>[0])),
        automations: byProject(rules, p._id).map((r) => mapRuleDoc(r as Parameters<typeof mapRuleDoc>[0])),
        forms: byProject(forms, p._id).map((f) => mapFormDoc(f as Parameters<typeof mapFormDoc>[0])),
      })),
      tags: tags.map((t) => mapTag(t as Parameters<typeof mapTag>[0])),
      goals: goals.map((g) => ({
        id: String(g._id), name: g.name, description: g.description ?? null, targetAt: iso(g.targetAt), archived: Boolean(g.archivedAt),
        milestones: (g.milestones ?? []).map((m) => ({ id: String(m._id), name: m.name, dueAt: iso(m.dueAt) })),
      })),
      savedFilters: filters.map((f) => mapFilterDoc(f as Parameters<typeof mapFilterDoc>[0])),
      templates: templates.map((t) => mapTemplateDoc(t as Parameters<typeof mapTemplateDoc>[0])),
      tasks,
      comments: comments.map((c) => mapComment(c as Parameters<typeof mapComment>[0])),
      timeEntries: time.map((e) => ({
        taskId: String(e.taskId), userId: String(e.userId), startedAt: iso(e.startedAt), endedAt: iso(e.endedAt), minutes: e.minutes ?? null, note: e.note ?? null,
      })),
      attachments: attachments.map((a) => ({
        taskId: String(a.taskId), filename: a.filename, contentType: a.mime, sizeBytes: a.sizeBytes, createdAt: iso(a.createdAt),
      })),
    };
  });
}

export type WorkspaceExport = Awaited<ReturnType<typeof buildWorkspaceExport>>;

/** The full export; admins only, as it lists members' emails. */
export async function exportWorkspaceJson(userId: string, workspaceId: string) {
  await withDb(() => requireWorkspaceRole(userId, workspaceId, "admin"));
  return buildWorkspaceExport(workspaceId);
}

/** Tasks as CSV; anyone who can see the workspace can see its tasks. */
export async function exportTasksCsv(userId: string, workspaceId: string) {
  return withDb(async () => {
    await requireWorkspaceRole(userId, workspaceId, "viewer");
    const ws = oid(workspaceId);
    const workspace = await Workspace.findById(ws).lean();
    if (!workspace) throw new ApiError(404, "not_found", "Workspace not found");
    const projects = await Project.find({ workspaceId: ws, deletedAt: null }).select("name").lean();
    const projectIds = projects.map((p) => p._id);
    const [tasks, sections, fields, tags, goals, members] = await Promise.all([
      liveTasks(ws),
      Section.find({ projectId: { $in: projectIds } }).select("name").lean(),
      ProjectField.find({ projectId: { $in: projectIds } }).lean(),
      Tag.find({ workspaceId: ws }).select("name").lean(),
      Goal.find({ workspaceId: ws }).select("name").lean(),
      listMembers(workspaceId),
    ]);
    const names = <T extends { _id: Types.ObjectId; name: string }>(rows: T[]) => new Map(rows.map((row) => [String(row._id), row.name]));
    const csv = tasksToCsv(tasks as TaskDto[], {
      projects: names(projects),
      sections: names(sections),
      tags: names(tags),
      goals: names(goals),
      people: new Map(members.map((m) => [m.userId, m.displayName])),
      statusNames: mapWorkspace(workspace as Parameters<typeof mapWorkspace>[0]).statusNames,
      fields: fields.map((f) => mapFieldDoc(f as Parameters<typeof mapFieldDoc>[0])),
    });
    return { name: workspace.name, csv };
  });
}
