import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Project, ProjectField, Task, WorkspaceMembership, type ProjectFieldDocument } from "@/src/server/models";
import { requireWorkspaceRole } from "@/src/server/workspace/members";
import {
  MAX_FIELDS, MAX_OPTIONS, checkFieldValue,
  type FieldType, type FieldValue, type FieldValues, type ProjectField as FieldDto,
} from "@/src/core/custom-fields";

const oid = (id: string) => new Types.ObjectId(id);

function map(doc: ProjectFieldDocument): FieldDto {
  return {
    id: String(doc._id),
    projectId: String(doc.projectId),
    name: doc.name,
    type: doc.type as FieldType,
    options: (doc.options ?? []).map((option) => ({ id: String(option._id), name: option.name })),
    position: doc.position,
  };
}

async function requireProject(userId: string, projectId: string, minRole: "viewer" | "member") {
  const project = await Project.findOne({ _id: oid(projectId), deletedAt: null }).select("workspaceId").lean();
  if (!project) throw new ApiError(404, "not_found", "Project not found");
  await requireWorkspaceRole(userId, String(project.workspaceId), minRole);
  return project;
}

async function requireField(userId: string, fieldId: string) {
  const field = await ProjectField.findById(oid(fieldId));
  if (!field) throw new ApiError(404, "not_found", "Field not found");
  await requireProject(userId, String(field.projectId), "member");
  return field;
}

/** Option names must be unique (case-insensitive) within a field. */
function cleanOptions(options: Array<{ id?: string; name: string }>) {
  if (options.length > MAX_OPTIONS) throw new ApiError(400, "limit_reached", `A field can have up to ${MAX_OPTIONS} options.`);
  const seen = new Set<string>();
  for (const option of options) {
    const key = option.name.trim().toLowerCase();
    if (seen.has(key)) throw new ApiError(400, "invalid_request", `“${option.name.trim()}” is listed twice`);
    seen.add(key);
  }
  return options.map((option) => ({ ...(option.id ? { _id: oid(option.id) } : {}), name: option.name.trim() }));
}

export function listFields(userId: string, projectId: string) {
  return withDb(async () => {
    await requireProject(userId, projectId, "viewer");
    const docs = await ProjectField.find({ projectId: oid(projectId) }).sort({ position: 1, createdAt: 1 }).lean();
    return docs.map((doc) => map(doc as ProjectFieldDocument));
  });
}

export function createField(userId: string, projectId: string, input: { name: string; type: FieldType; options?: Array<{ name: string }> }) {
  return withDb(async () => {
    const project = await requireProject(userId, projectId, "member");
    const scope = { projectId: oid(projectId) };
    if (await ProjectField.countDocuments(scope) >= MAX_FIELDS) {
      throw new ApiError(400, "limit_reached", `A project can have up to ${MAX_FIELDS} fields.`);
    }
    const last = await ProjectField.findOne(scope).sort({ position: -1 }).select("position").lean();
    const doc = await ProjectField.create({
      ...scope,
      workspaceId: project.workspaceId,
      name: input.name,
      type: input.type,
      options: input.type === "select" ? cleanOptions(input.options ?? []) : [],
      position: (last?.position ?? 0) + 1000,
    });
    return map(doc.toObject());
  });
}

/**
 * Renames, reorders, or replaces a select field's options (keep an option's
 * id to keep it; tasks set to a dropped option are cleared).
 */
export function updateField(userId: string, fieldId: string, patch: { name?: string; position?: number; options?: Array<{ id?: string; name: string }> }) {
  return withDb(async () => {
    const field = await requireField(userId, fieldId);
    if (patch.name !== undefined) field.name = patch.name;
    if (patch.position !== undefined) field.position = patch.position;
    if (patch.options !== undefined) {
      if (field.type !== "select") throw new ApiError(400, "invalid_request", "Only select fields have options");
      const before = new Set(field.options.map((option) => String(option._id)));
      const kept = patch.options.filter((option) => option.id);
      if (kept.some((option) => !before.has(option.id!))) throw new ApiError(400, "invalid_request", "Unknown option");
      const keptIds = new Set(kept.map((option) => option.id!));
      const dropped = [...before].filter((id) => !keptIds.has(id));
      field.set("options", cleanOptions(patch.options));
      if (dropped.length) {
        await Task.updateMany({ projectId: field.projectId, [`fieldValues.${fieldId}`]: { $in: dropped } }, { $unset: { [`fieldValues.${fieldId}`]: "" } });
      }
    }
    await field.save();
    return map(field.toObject());
  });
}

/** Deletes the field and every task's value for it. */
export function deleteField(userId: string, fieldId: string) {
  return withDb(async () => {
    const field = await requireField(userId, fieldId);
    await Task.updateMany({ projectId: field.projectId }, { $unset: { [`fieldValues.${fieldId}`]: "" } });
    await field.deleteOne();
  });
}

/**
 * Merges `patch` (field id → value, null to clear) into a task's values,
 * checking each against the project's fields. Throws on the first bad one.
 */
export async function mergeFieldValues(projectId: string | null, workspaceId: Types.ObjectId, current: FieldValues, patch: Record<string, unknown>): Promise<FieldValues> {
  const keys = Object.keys(patch);
  if (!keys.length) return current;
  if (!projectId) throw new ApiError(400, "invalid_request", "Inbox tasks have no custom fields");
  if (keys.length > MAX_FIELDS) throw new ApiError(400, "invalid_request", "Too many field values");
  const docs = await ProjectField.find({ projectId: oid(projectId) }).lean();
  const fields = new Map(docs.map((doc) => [String(doc._id), map(doc as ProjectFieldDocument)]));
  const needsMembers = keys.some((key) => fields.get(key)?.type === "person" && patch[key]);
  const memberIds = needsMembers
    ? new Set((await WorkspaceMembership.find({ workspaceId }).select("userId").lean()).map((m) => String(m.userId)))
    : new Set<string>();
  const next: FieldValues = { ...current };
  for (const key of keys) {
    const field = fields.get(key);
    if (!field) throw new ApiError(400, "invalid_request", "That field isn't on this project");
    const checked = checkFieldValue(field, patch[key], memberIds);
    if (!checked.ok) throw new ApiError(400, "invalid_request", checked.error);
    if (checked.value === null) delete next[key];
    else next[key] = checked.value as FieldValue;
  }
  return next;
}

/** For exports. */
export { map as mapFieldDoc };
