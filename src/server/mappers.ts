import { asRecurrenceRule } from "@/src/core/recurrence/next";
import type { Types } from "mongoose";
import type {
  ActivityEvent,
  BoardColumn,
  ChecklistItem,
  Comment,
  Project,
  Tag,
  Task,
  Workspace,
} from "@/src/core/sync/types";
import type { MemberRole, TaskPriority, TaskStatus } from "@/src/core/models/enums";

function idOf(value: Types.ObjectId | string | null | undefined): string | null {
  if (!value) return null;
  return String(value);
}

function iso(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString();
}

export function mapWorkspace(doc: {
  _id: Types.ObjectId;
  kind: Workspace["kind"];
  name: string;
  slug: string;
  ownerUserId: Types.ObjectId;
  spaceId?: string | null;
  spaceName?: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Workspace {
  return {
    id: doc._id.toString(),
    kind: doc.kind,
    name: doc.name,
    slug: doc.slug,
    ownerUserId: doc.ownerUserId.toString(),
    spaceId: doc.spaceId ?? null,
    spaceName: doc.spaceName ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function mapProject(doc: {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  name: string;
  description?: string | null;
  color?: string | null;
  defaultView: Project["defaultView"];
  archivedAt?: Date | null;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): Project {
  return {
    id: doc._id.toString(),
    workspaceId: doc.workspaceId.toString(),
    name: doc.name,
    description: doc.description ?? null,
    color: doc.color ?? null,
    defaultView: doc.defaultView,
    archivedAt: iso(doc.archivedAt ?? null),
    deletedAt: iso(doc.deletedAt ?? null),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function mapColumn(doc: {
  _id: Types.ObjectId;
  projectId: Types.ObjectId;
  name: string;
  statusMapped?: TaskStatus | null;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}): BoardColumn {
  return {
    id: doc._id.toString(),
    projectId: doc.projectId.toString(),
    name: doc.name,
    statusMapped: (doc.statusMapped as TaskStatus | null) ?? null,
    position: doc.position,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function mapTask(doc: {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  projectId?: Types.ObjectId | null;
  columnId?: Types.ObjectId | null;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt?: Date | null;
  dueHasTime?: boolean | null;
  startAt?: Date | null;
  sectionId?: Types.ObjectId | null;
  goalId?: Types.ObjectId | null;
  milestoneId?: Types.ObjectId | null;
  fieldValues?: unknown;
  deadlineAt?: Date | null;
  durationMinutes?: number | null;
  reminderMinutes?: number | null;
  completedAt?: Date | null;
  position: number;
  assigneeIds?: Types.ObjectId[];
  tagIds?: Types.ObjectId[];
  blockedByIds?: Types.ObjectId[];
  habit?: boolean | null;
  seriesId?: Types.ObjectId | null;
  parentTaskId?: Types.ObjectId | null;
  recurrence?: {
    frequency: string;
    interval?: number | null;
    byWeekday?: number[] | null;
    monthDay?: number | null;
    fromCompletion?: boolean | null;
    timeZone?: string | null;
  } | null;
  checklist?: Array<{
    _id?: Types.ObjectId;
    title: string;
    completed?: boolean;
    position: number;
  }>;
  createdById: Types.ObjectId;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): Task {
  return {
    id: doc._id.toString(),
    workspaceId: doc.workspaceId.toString(),
    projectId: idOf(doc.projectId ?? null),
    columnId: idOf(doc.columnId ?? null),
    title: doc.title,
    description: doc.description ?? null,
    status: doc.status,
    priority: doc.priority,
    dueAt: iso(doc.dueAt ?? null),
    dueHasTime: Boolean(doc.dueAt && doc.dueHasTime),
    startAt: iso(doc.startAt ?? null),
    sectionId: idOf(doc.sectionId ?? null),
    goalId: idOf(doc.goalId ?? null),
    milestoneId: idOf(doc.goalId ? doc.milestoneId ?? null : null),
    fieldValues: { ...((doc.fieldValues ?? {}) as Record<string, string | number>) },
    deadlineAt: iso(doc.deadlineAt ?? null),
    durationMinutes: doc.durationMinutes ?? null,
    reminderMinutes: doc.reminderMinutes ?? null,
    completedAt: iso(doc.completedAt ?? null),
    position: doc.position,
    assigneeIds: (doc.assigneeIds ?? []).map((id) => id.toString()),
    tagIds: (doc.tagIds ?? []).map((id) => id.toString()),
    blockedByIds: (doc.blockedByIds ?? []).map((id) => id.toString()),
    habit: Boolean(doc.habit),
    seriesId: idOf(doc.seriesId ?? null),
    parentTaskId: idOf(doc.parentTaskId ?? null),
    recurrence: asRecurrenceRule(doc.recurrence),
    checklist: (doc.checklist ?? []).map(
      (item): ChecklistItem => ({
        id: item._id?.toString() ?? `${item.position}-${item.title}`,
        title: item.title,
        completed: Boolean(item.completed),
        position: item.position,
      }),
    ),
    createdById: doc.createdById.toString(),
    deletedAt: iso(doc.deletedAt ?? null),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function mapTag(doc: {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  name: string;
  color?: string | null;
}): Tag {
  return {
    id: doc._id.toString(),
    workspaceId: doc.workspaceId.toString(),
    name: doc.name,
    color: doc.color || "#52D3FE",
  };
}

export function mapComment(doc: {
  mentions?: Array<{ userId: Types.ObjectId; start: number; end: number }>;
  _id: Types.ObjectId;
  taskId: Types.ObjectId;
  authorId: Types.ObjectId;
  body: string;
  editedAt?: Date | null;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): Comment {
  return {
    id: doc._id.toString(),
    taskId: doc.taskId.toString(),
    authorId: doc.authorId.toString(),
    body: doc.body,
    mentions: (doc.mentions ?? []).map((mention) => ({ userId: mention.userId.toString(), start: mention.start, end: mention.end })),
    editedAt: iso(doc.editedAt ?? null),
    deletedAt: iso(doc.deletedAt ?? null),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function mapActivity(doc: {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  projectId?: Types.ObjectId | null;
  taskId?: Types.ObjectId | null;
  actorId: Types.ObjectId;
  verb: string;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
}): ActivityEvent {
  return {
    id: doc._id.toString(),
    workspaceId: doc.workspaceId.toString(),
    projectId: idOf(doc.projectId ?? null),
    taskId: idOf(doc.taskId ?? null),
    actorId: doc.actorId.toString(),
    verb: doc.verb,
    metadata: (doc.metadata ?? {}) as Record<string, unknown>,
    createdAt: doc.createdAt.toISOString(),
  };
}

export type MembershipRole = MemberRole;
