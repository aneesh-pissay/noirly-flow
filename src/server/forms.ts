import { randomBytes } from "node:crypto";
import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { IntakeForm, Project, Section, Tag, WorkspaceMembership, type IntakeFormDocument } from "@/src/server/models";
import { requireWorkspaceRole } from "@/src/server/workspace/members";
import { consumeRateLimit } from "@/src/server/security/rate-limit";
import {
  MAX_QUESTIONS, checkAnswers, describeSubmission,
  type FormAnswers, type FormQuestion, type IntakeForm as FormDto, type PublicForm, type QuestionKind,
} from "@/src/core/forms";
import type { TaskPriority } from "@/src/core/models/enums";
import type { SyncProvider } from "@/src/core/sync/types";

const oid = (id: string | Types.ObjectId) => new Types.ObjectId(String(id));
const MAX_FORMS = 20;
/** Submissions one address may send to one form per hour, and one form may take per day. */
const PER_IP_PER_HOUR = 10;
const PER_FORM_PER_DAY = 500;

export type FormInput = {
  name: string;
  intro?: string | null;
  titleLabel: string;
  askDetails: boolean;
  questions: Array<{ id?: string; label: string; kind: QuestionKind; required: boolean; options: string[] }>;
  defaults: { priority: TaskPriority; sectionId: string | null; tagIds: string[]; assigneeId: string | null };
  confirmation?: string | null;
  enabled?: boolean;
};

function questionsOf(doc: IntakeFormDocument): FormQuestion[] {
  return (doc.questions ?? []).map((q) => ({
    id: String(q._id), label: q.label, kind: q.kind as QuestionKind, required: Boolean(q.required), options: q.options ?? [],
  }));
}

function map(doc: IntakeFormDocument): FormDto {
  return {
    id: String(doc._id),
    projectId: String(doc.projectId),
    publicId: doc.publicId,
    name: doc.name,
    intro: doc.intro ?? null,
    titleLabel: doc.titleLabel,
    askDetails: doc.askDetails,
    questions: questionsOf(doc),
    defaults: {
      priority: (doc.defaults?.priority ?? "none") as TaskPriority,
      sectionId: doc.defaults?.sectionId ? String(doc.defaults.sectionId) : null,
      tagIds: (doc.defaults?.tagIds ?? []).map(String),
      assigneeId: doc.defaults?.assigneeId ? String(doc.defaults.assigneeId) : null,
    },
    confirmation: doc.confirmation ?? null,
    enabled: doc.enabled,
    submissionCount: doc.submissionCount ?? 0,
    lastSubmittedAt: doc.lastSubmittedAt ? doc.lastSubmittedAt.toISOString() : null,
  };
}

async function requireProject(userId: string, projectId: string, minRole: "viewer" | "member") {
  const project = await Project.findOne({ _id: oid(projectId), deletedAt: null }).select("workspaceId").lean();
  if (!project) throw new ApiError(404, "not_found", "Project not found");
  await requireWorkspaceRole(userId, String(project.workspaceId), minRole);
  return project;
}

async function requireForm(userId: string, formId: string) {
  const form = await IntakeForm.findById(oid(formId));
  if (!form) throw new ApiError(404, "not_found", "Form not found");
  await requireProject(userId, String(form.projectId), "member");
  return form;
}

/** Defaults must point inside the form's project and workspace. */
async function assertDefaults(workspaceId: Types.ObjectId, projectId: Types.ObjectId, defaults: FormInput["defaults"]) {
  if (defaults.sectionId && !await Section.exists({ _id: oid(defaults.sectionId), projectId })) {
    throw new ApiError(400, "invalid_request", "That section isn't in this project");
  }
  const tags = [...new Set(defaults.tagIds)];
  if (tags.length && await Tag.countDocuments({ _id: { $in: tags.map(oid) }, workspaceId }) !== tags.length) {
    throw new ApiError(400, "invalid_request", "A tag isn't in this workspace");
  }
  if (defaults.assigneeId && !await WorkspaceMembership.exists({ workspaceId, userId: oid(defaults.assigneeId) })) {
    throw new ApiError(400, "invalid_request", "The assignee isn't in this workspace");
  }
}

function cleanQuestions(questions: FormInput["questions"], existing: Set<string>) {
  if (questions.length > MAX_QUESTIONS) throw new ApiError(400, "limit_reached", `A form can have up to ${MAX_QUESTIONS} questions.`);
  return questions.map((q) => {
    if (q.kind === "choice" && q.options.filter((o) => o.trim()).length < 2) {
      throw new ApiError(400, "invalid_request", `“${q.label}” needs at least two choices`);
    }
    return {
      ...(q.id && existing.has(q.id) ? { _id: oid(q.id) } : {}),
      label: q.label.trim(),
      kind: q.kind,
      required: q.required,
      options: q.kind === "choice" ? [...new Set(q.options.map((o) => o.trim()).filter(Boolean))] : [],
    };
  });
}

export function listForms(userId: string, projectId: string) {
  return withDb(async () => {
    await requireProject(userId, projectId, "viewer");
    const docs = await IntakeForm.find({ projectId: oid(projectId) }).sort({ createdAt: 1 }).lean();
    return docs.map((doc) => map(doc as IntakeFormDocument));
  });
}

export function createForm(userId: string, projectId: string, input: FormInput) {
  return withDb(async () => {
    const project = await requireProject(userId, projectId, "member");
    if (await IntakeForm.countDocuments({ projectId: oid(projectId) }) >= MAX_FORMS) {
      throw new ApiError(400, "limit_reached", `A project can have up to ${MAX_FORMS} forms.`);
    }
    await assertDefaults(project.workspaceId, oid(projectId), input.defaults);
    const doc = await IntakeForm.create({
      workspaceId: project.workspaceId,
      projectId: oid(projectId),
      publicId: randomBytes(16).toString("base64url"),
      name: input.name,
      intro: input.intro?.trim() || null,
      titleLabel: input.titleLabel,
      askDetails: input.askDetails,
      questions: cleanQuestions(input.questions, new Set()),
      defaults: {
        priority: input.defaults.priority,
        sectionId: input.defaults.sectionId ? oid(input.defaults.sectionId) : null,
        tagIds: [...new Set(input.defaults.tagIds)].map(oid),
        assigneeId: input.defaults.assigneeId ? oid(input.defaults.assigneeId) : null,
      },
      confirmation: input.confirmation?.trim() || null,
      enabled: input.enabled ?? true,
      createdById: oid(userId),
    });
    return map(doc.toObject());
  });
}

export function updateForm(userId: string, formId: string, input: Partial<FormInput>) {
  return withDb(async () => {
    const form = await requireForm(userId, formId);
    if (input.defaults) await assertDefaults(form.workspaceId, form.projectId, input.defaults);
    if (input.name !== undefined) form.name = input.name;
    if (input.intro !== undefined) form.intro = input.intro?.trim() || null;
    if (input.titleLabel !== undefined) form.titleLabel = input.titleLabel;
    if (input.askDetails !== undefined) form.askDetails = input.askDetails;
    if (input.questions !== undefined) {
      form.set("questions", cleanQuestions(input.questions, new Set(form.questions.map((q) => String(q._id)))));
    }
    if (input.defaults !== undefined) {
      form.set("defaults", {
        priority: input.defaults.priority,
        sectionId: input.defaults.sectionId ? oid(input.defaults.sectionId) : null,
        tagIds: [...new Set(input.defaults.tagIds)].map(oid),
        assigneeId: input.defaults.assigneeId ? oid(input.defaults.assigneeId) : null,
      });
    }
    if (input.confirmation !== undefined) form.confirmation = input.confirmation?.trim() || null;
    if (input.enabled !== undefined) form.enabled = input.enabled;
    await form.save();
    return map(form.toObject());
  });
}

export function deleteForm(userId: string, formId: string) {
  return withDb(async () => {
    const form = await requireForm(userId, formId);
    await form.deleteOne();
  });
}

/** The live form behind a public link, or null when it's off, gone, or its project is. */
async function liveForm(publicId: string) {
  if (!/^[\w-]{16,40}$/.test(publicId)) return null;
  const form = await IntakeForm.findOne({ publicId, enabled: true }).lean();
  if (!form) return null;
  const project = await Project.findOne({ _id: form.projectId, deletedAt: null, archivedAt: null }).select("_id").lean();
  return project ? (form as IntakeFormDocument) : null;
}

/** What the public page shows, or null for a 404. */
export function getPublicForm(publicId: string) {
  return withDb(async (): Promise<PublicForm | null> => {
    const form = await liveForm(publicId);
    if (!form) return null;
    const { name, intro, titleLabel, askDetails, questions, confirmation } = map(form);
    return { name, intro, titleLabel, askDetails, questions, confirmation };
  });
}

/**
 * Turns a public submission into a task in the form's project, created as
 * the form's creator through `syncFor` (so automations and webhooks run).
 * `website` is the honeypot: people leave it empty, bots tend to fill it.
 */
export async function submitForm(publicId: string, input: FormAnswers & { website?: unknown }, ip: string, syncFor: (userId: string) => SyncProvider) {
  const form = await withDb(() => liveForm(publicId));
  if (!form) throw new ApiError(404, "not_found", "This form isn't taking responses");
  if (typeof input.website === "string" && input.website.trim()) return { ok: true as const };
  const perIp = await consumeRateLimit(`flow-form:${String(form._id)}:${ip}`, PER_IP_PER_HOUR, 3600);
  const perForm = await consumeRateLimit(`flow-form:${String(form._id)}`, PER_FORM_PER_DAY, 86_400);
  if (!perIp.allowed || !perForm.allowed) throw new ApiError(429, "rate_limited", "Too many responses. Try again later.");

  const dto = map(form);
  const checked = checkAnswers(dto, input);
  if (!checked.ok) return { ok: false as const, errors: checked.errors };

  // The creator must still be able to add tasks here.
  const membership = await withDb(() => WorkspaceMembership.findOne({ workspaceId: form.workspaceId, userId: form.createdById }).select("role").lean());
  if (!membership || membership.role === "viewer") throw new ApiError(404, "not_found", "This form isn't taking responses");

  const sync = syncFor(String(form.createdById));
  const task = await sync.createTask({
    workspaceId: String(form.workspaceId),
    projectId: String(form.projectId),
    title: checked.title,
    description: describeSubmission(dto.name, checked.details, checked.answers),
    priority: dto.defaults.priority,
    sectionId: dto.defaults.sectionId,
    tagIds: dto.defaults.tagIds,
    assigneeIds: dto.defaults.assigneeId ? [dto.defaults.assigneeId] : [],
  });
  await withDb(() => IntakeForm.updateOne({ _id: form._id }, { $inc: { submissionCount: 1 }, $set: { lastSubmittedAt: new Date() } }));
  return { ok: true as const, taskId: task.id };
}
