import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Project, Section, Task, WorkspaceMembership, type SectionDocument } from "@/src/server/models";
import type { MemberRole } from "@/src/core/models/enums";
import type { Section as SectionDto } from "@/src/core/sync/types";

const MAX_SECTIONS = 50;
const RANK: Record<MemberRole, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };

function map(doc: SectionDocument): SectionDto {
  return { id: String(doc._id), projectId: String(doc.projectId), name: doc.name, position: doc.position };
}

/** The live project, after checking the caller's role in its workspace. */
async function requireProject(userId: string, projectId: string, minRole: MemberRole) {
  const project = await Project.findOne({ _id: new Types.ObjectId(projectId), deletedAt: null }).select("workspaceId").lean();
  if (!project) throw new ApiError(404, "not_found", "Project not found");
  const membership = await WorkspaceMembership.findOne({ workspaceId: project.workspaceId, userId: new Types.ObjectId(userId) }).select("role").lean();
  if (!membership) throw new ApiError(403, "forbidden", "Not a member of this workspace");
  if (RANK[membership.role as MemberRole] < RANK[minRole]) throw new ApiError(403, "forbidden", "You can't change this project");
  return project;
}

async function requireSection(userId: string, sectionId: string) {
  const section = await Section.findById(new Types.ObjectId(sectionId));
  if (!section) throw new ApiError(404, "not_found", "Section not found");
  await requireProject(userId, String(section.projectId), "member");
  return section;
}

export function listSections(userId: string, projectId: string) {
  return withDb(async () => {
    await requireProject(userId, projectId, "viewer");
    const docs = await Section.find({ projectId: new Types.ObjectId(projectId) }).sort({ position: 1, createdAt: 1 }).lean();
    return docs.map(map);
  });
}

export function createSection(userId: string, projectId: string, name: string) {
  return withDb(async () => {
    const project = await requireProject(userId, projectId, "member");
    const scope = { projectId: new Types.ObjectId(projectId) };
    if (await Section.countDocuments(scope) >= MAX_SECTIONS) {
      throw new ApiError(400, "limit_reached", `A project can have up to ${MAX_SECTIONS} sections.`);
    }
    const last = await Section.findOne(scope).sort({ position: -1 }).select("position").lean();
    const doc = await Section.create({ ...scope, workspaceId: project.workspaceId, name, position: (last?.position ?? 0) + 1000 });
    return map(doc.toObject());
  });
}

export function updateSection(userId: string, sectionId: string, patch: { name?: string; position?: number }) {
  return withDb(async () => {
    const section = await requireSection(userId, sectionId);
    if (patch.name !== undefined) section.name = patch.name;
    if (patch.position !== undefined) section.position = patch.position;
    await section.save();
    return map(section.toObject());
  });
}

/** Deletes the section; its tasks stay in the project, under "No section". */
export function deleteSection(userId: string, sectionId: string) {
  return withDb(async () => {
    const section = await requireSection(userId, sectionId);
    await Task.updateMany({ sectionId: section._id }, { $set: { sectionId: null } });
    await section.deleteOne();
  });
}
