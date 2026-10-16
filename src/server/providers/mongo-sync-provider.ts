import { Types, type HydratedDocument } from "mongoose";
import type { TaskDocument } from "@/src/server/models";
import type {
  CommentMention,
  CreateProjectInput,
  CreateTaskInput,
  ListTasksQuery,
  RecurrenceRule,
  ReorderTasksInput,
  SyncProvider,
  Task,
} from "@/src/core/sync/types";
import type { MemberRole, TaskStatus } from "@/src/core/models/enums";
import {
  asRecurrenceRule,
  nextOccurrenceDueAt,
} from "@/src/core/recurrence/next";
import { withDb } from "@/src/server/db/mongodb";
import {
  ActivityEvent,
  BoardColumn,
  Comment,
  Notification,
  Project,
  Tag,
  Task as TaskModel,
  Workspace,
  WorkspaceMembership,
} from "@/src/server/models";
import {
  mapActivity,
  mapColumn,
  mapComment,
  mapProject,
  mapTag,
  mapTask,
  mapWorkspace,
} from "@/src/server/mappers";
import { ApiError } from "@/src/server/api/http";
import { idsEqual, recordActivity } from "@/src/server/activity";
import { escapeRegex } from "@/src/server/search";
import { notify } from "@/src/server/notifications";
import { purgeWorkspace } from "@/src/server/users/delete-account";

/** The trash shows this many of the most recently deleted tasks. */
const TRASH_LIMIT = 200;
const MAX_COLUMNS = 12;

type ProviderContext = {
  userId: string;
};

async function assertTaskReferences(workspaceId: string, refs: {
  projectId?: string | null; columnId?: string | null; parentTaskId?: string | null;
  tagIds?: string[]; taskId?: string;
}) {
  const workspace = oid(workspaceId);
  if (refs.projectId && !await Project.exists({ _id: oid(refs.projectId), workspaceId: workspace, deletedAt: null })) {
    throw new ApiError(403, "forbidden", "Project is not in this workspace");
  }
  if (refs.columnId && (!refs.projectId || !await BoardColumn.exists({ _id: oid(refs.columnId), projectId: oid(refs.projectId) }))) {
    throw new ApiError(403, "forbidden", "Column is not in this project");
  }
  if (refs.parentTaskId && (refs.parentTaskId === refs.taskId || !await TaskModel.exists({ _id: oid(refs.parentTaskId), workspaceId: workspace, deletedAt: null }))) {
    throw new ApiError(403, "forbidden", "Invalid parent task");
  }
  const tags = [...new Set(refs.tagIds ?? [])];
  if (tags.length && await Tag.countDocuments({ _id: { $in: tags.map(oid) }, workspaceId: workspace }) !== tags.length) {
    throw new ApiError(403, "forbidden", "Tag is not in this workspace");
  }
}

function oid(id: string) {
  if (typeof id !== "string" || !/^[a-f0-9]{24}$/i.test(id)) throw new ApiError(400, "invalid_request", "Invalid object ID");
  return new Types.ObjectId(id);
}

/** Trims the body and checks each @-tag sits on its text, in order, without overlap. */
function checkCommentBody(input: { body: string; mentions?: CommentMention[] }) {
  const body = input.body.trim();
  if (!body) {
    throw new ApiError(400, "invalid_request", "Comment cannot be empty");
  }
  const mentions = [...(input.mentions ?? [])].sort((a, b) => a.start - b.start);
  if (mentions.length > 50 || mentions.some((mention, index) =>
    !Number.isInteger(mention.start) || !Number.isInteger(mention.end) ||
    mention.start < 0 || mention.end > body.length || mention.end <= mention.start + 1 ||
    body[mention.start] !== "@" || /[\r\n]/.test(body.slice(mention.start, mention.end)) ||
    (index > 0 && mention.start < mentions[index - 1].end)
  )) throw new ApiError(400, "invalid_request", "Invalid comment mentions");
  const recipientIds = [...new Set(mentions.map((mention) => mention.userId.toLowerCase()))];
  return { body, mentions, recipientIds };
}

function nextPosition(after?: number | null) {
  if (typeof after === "number" && Number.isFinite(after)) {
    return after + 1000;
  }
  return Date.now();
}

function completionRecipients(creator: Types.ObjectId, assignees: Types.ObjectId[]) {
  return [...new Set([creator, ...assignees].map(String))].map((id) => ({
    _id: new Types.ObjectId(), userId: oid(id), pending: true,
    nextAttemptAt: new Date(0), lockedUntil: new Date(0), attempts: 0,
  }));
}

async function spawnNextOccurrence(
  source: HydratedDocument<TaskDocument>,
  rule: RecurrenceRule,
  actorId: string,
) {
  const dueAt = nextOccurrenceDueAt(source.dueAt, rule);
  // The next copy keeps its start date and deadline the same distance from its due date as this one did.
  const shifted = (date: Date | null | undefined) => date && source.dueAt
    ? new Date(dueAt.getTime() - (source.dueAt.getTime() - date.getTime()))
    : null;
  const startAt = shifted(source.startAt);
  const deadlineAt = shifted(source.deadlineAt);
  let columnId = null;
  if (source.projectId) {
    const column = await firstColumnFor(source.projectId, "todo");
    columnId = column?._id ?? null;
  }

  const last = await TaskModel.findOne({
    workspaceId: source.workspaceId,
    projectId: source.projectId ?? null,
    columnId,
    deletedAt: null,
  })
    .sort({ position: -1 })
    .lean();

  const next = await TaskModel.create({
    workspaceId: source.workspaceId,
    projectId: source.projectId ?? null,
    columnId,
    title: source.title,
    description: source.description,
    status: "todo",
    priority: source.priority,
    dueAt,
    dueHasTime: Boolean(source.dueHasTime),
    startAt,
    deadlineAt,
    durationMinutes: source.durationMinutes ?? null,
    position: nextPosition(last?.position),
    assigneeIds: source.assigneeIds ?? [],
    emailDeliveries: [...new Set((source.assigneeIds ?? []).map(String))].map((userId) => ({ userId: oid(userId) })),
    tagIds: source.tagIds ?? [],
    parentTaskId: source.parentTaskId ?? null,
    recurrence: rule,
    checklist: (source.checklist ?? []).map((item, index) => ({
      title: item.title,
      completed: false,
      position: (index + 1) * 1000,
    })),
    createdById: oid(actorId),
  });

  await recordActivity({
    workspaceId: next.workspaceId,
    projectId: next.projectId,
    taskId: next._id,
    actorId,
    verb: "task.created",
    metadata: {
      title: next.title,
      fromRecurrence: source._id.toString(),
    },
  });
}

async function requireMembership(
  userId: string,
  workspaceId: string,
  minRole: MemberRole = "viewer",
): Promise<MemberRole> {
  const membership = await WorkspaceMembership.findOne({
    workspaceId: oid(workspaceId),
    userId: oid(userId),
  }).lean();

  if (!membership) {
    throw new ApiError(403, "forbidden", "Not a member of this workspace");
  }

  const rank: Record<MemberRole, number> = {
    viewer: 1,
    member: 2,
    admin: 3,
    owner: 4,
  };

  if (rank[membership.role as MemberRole] < rank[minRole]) {
    throw new ApiError(403, "forbidden", "Insufficient permissions");
  }

  return membership.role as MemberRole;
}

/** A project that isn't deleted, after checking the caller's role in its workspace. */
async function requireLiveProject(userId: string, projectId: string, minRole: MemberRole) {
  const project = await Project.findById(oid(projectId)).lean();
  if (!project || project.deletedAt) {
    throw new ApiError(404, "not_found", "Project not found");
  }
  await requireMembership(userId, project.workspaceId.toString(), minRole);
  return project;
}

async function listColumns(projectId: Types.ObjectId) {
  const columns = await BoardColumn.find({ projectId }).sort({ position: 1 }).lean();
  return columns.map(mapColumn);
}

/** The leftmost column for a status; tasks without a column choice land here. */
function firstColumnFor(projectId: Types.ObjectId, status: TaskStatus) {
  return BoardColumn.findOne({ projectId, statusMapped: status }).sort({ position: 1 }).lean();
}

/**
 * A column may lose its status only while another column keeps it, or tasks
 * set to that status from the list would have nowhere to show on the board.
 * Returns that other column.
 */
async function assertStatusKeepsAColumn(column: { _id: Types.ObjectId; projectId: Types.ObjectId; statusMapped?: TaskStatus | null }) {
  const other = await BoardColumn.findOne({
    projectId: column.projectId,
    statusMapped: column.statusMapped,
    _id: { $ne: column._id },
  }).sort({ position: 1 }).lean();
  if (!other) {
    throw new ApiError(409, "last_status_column", "Each of Todo, In progress and Done needs at least one column");
  }
  return other;
}

async function requireTaskAccess(userId: string, taskId: string) {
  const task = await TaskModel.findById(taskId);
  if (!task || task.deletedAt) {
    throw new ApiError(404, "not_found", "Task not found");
  }
  await requireMembership(userId, task.workspaceId.toString(), "viewer");
  return task;
}

async function assertAssigneesInWorkspace(
  workspaceId: string,
  assigneeIds: string[],
) {
  if (assigneeIds.length === 0) return;
  const unique = [...new Set(assigneeIds)];
  const count = await WorkspaceMembership.countDocuments({
    workspaceId: oid(workspaceId),
    userId: { $in: unique.map(oid) },
  });
  if (count !== unique.length) {
    throw new ApiError(
      400,
      "invalid_request",
      "Assignees must be workspace members",
    );
  }
}

export function createMongoSyncProvider(ctx: ProviderContext): SyncProvider {
  const { userId } = ctx;

  return {
    async listWorkspaces() {
      return withDb(async () => {
        const memberships = await WorkspaceMembership.find({
          userId: oid(userId),
        }).lean();
        const ids = memberships.map((m) => m.workspaceId);
        const workspaces = await Workspace.find({ _id: { $in: ids } })
          .sort({ createdAt: 1 })
          .lean();
        return workspaces.map(mapWorkspace);
      });
    },

    async getWorkspace(id) {
      return withDb(async () => {
        const role = await requireMembership(userId, id, "viewer");
        const workspace = await Workspace.findById(id).lean();
        if (!workspace) {
          throw new ApiError(404, "not_found", "Workspace not found");
        }
        return { ...mapWorkspace(workspace), role };
      });
    },

    async createWorkspace(input) {
      return withDb(async () => {
        const base = input.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 40) || "team";
        let slug = base;
        let n = 0;
        while (await Workspace.exists({ slug })) {
          n += 1;
          slug = `${base}-${n}`;
        }

        const workspace = await Workspace.create({
          kind: "team",
          name: input.name.trim(),
          slug,
          ownerUserId: oid(userId),
        });

        await WorkspaceMembership.create({
          workspaceId: workspace._id,
          userId: oid(userId),
          role: "owner",
        });

        const project = await Project.create({
          workspaceId: workspace._id,
          name: "General",
          defaultView: "board",
        });
        await BoardColumn.insertMany([
          {
            projectId: project._id,
            name: "Todo",
            statusMapped: "todo",
            position: 1000,
          },
          {
            projectId: project._id,
            name: "In progress",
            statusMapped: "in_progress",
            position: 2000,
          },
          {
            projectId: project._id,
            name: "Done",
            statusMapped: "done",
            position: 3000,
          },
        ]);

        return mapWorkspace(workspace);
      });
    },

    async updateWorkspace(id, patch) {
      return withDb(async () => {
        await requireMembership(userId, id, "admin");
        const workspace = await Workspace.findById(id);
        if (!workspace) {
          throw new ApiError(404, "not_found", "Workspace not found");
        }
        if (workspace.kind === "personal") {
          throw new ApiError(400, "invalid_request", "Your personal workspace can't be renamed");
        }
        workspace.name = patch.name.trim();
        await workspace.save();
        return mapWorkspace(workspace);
      });
    },

    async deleteWorkspace(id) {
      return withDb(async () => {
        await requireMembership(userId, id, "owner");
        const workspace = await Workspace.findById(id).select("kind").lean();
        if (!workspace) {
          throw new ApiError(404, "not_found", "Workspace not found");
        }
        if (workspace.kind === "personal") {
          throw new ApiError(400, "invalid_request", "Your personal workspace can't be deleted");
        }
        await purgeWorkspace(workspace._id);
      });
    },

    async listProjects(workspaceId) {
      return withDb(async () => {
        await requireMembership(userId, workspaceId, "viewer");
        const projects = await Project.find({
          workspaceId: oid(workspaceId),
          deletedAt: null,
        })
          .sort({ createdAt: 1 })
          .lean();
        return projects.map(mapProject);
      });
    },

    async getProject(projectId) {
      return withDb(async () => {
        const project = await Project.findById(projectId).lean();
        if (!project || project.deletedAt) {
          throw new ApiError(404, "not_found", "Project not found");
        }
        await requireMembership(userId, project.workspaceId.toString(), "viewer");
        const columns = await BoardColumn.find({ projectId: project._id })
          .sort({ position: 1 })
          .lean();
        return {
          ...mapProject(project),
          columns: columns.map(mapColumn),
        };
      });
    },

    async createProject(input: CreateProjectInput) {
      return withDb(async () => {
        await requireMembership(userId, input.workspaceId, "member");
        const project = await Project.create({
          workspaceId: oid(input.workspaceId),
          name: input.name.trim(),
          description: input.description ?? null,
          color: input.color ?? null,
          defaultView: input.defaultView ?? "board",
        });

        await BoardColumn.insertMany([
          {
            projectId: project._id,
            name: "Todo",
            statusMapped: "todo",
            position: 1000,
          },
          {
            projectId: project._id,
            name: "In progress",
            statusMapped: "in_progress",
            position: 2000,
          },
          {
            projectId: project._id,
            name: "Done",
            statusMapped: "done",
            position: 3000,
          },
        ]);

        return mapProject(project);
      });
    },

    async updateProject(projectId, patch) {
      return withDb(async () => {
        const project = await Project.findById(projectId);
        if (!project || project.deletedAt) {
          throw new ApiError(404, "not_found", "Project not found");
        }
        await requireMembership(userId, project.workspaceId.toString(), "member");
        const before = project.name;
        if (patch.name !== undefined) project.name = patch.name.trim();
        if (patch.description !== undefined) project.description = patch.description;
        await project.save();
        if (project.name !== before) {
          void recordActivity({
            workspaceId: project.workspaceId,
            projectId: project._id,
            actorId: userId,
            verb: "project.renamed",
            metadata: { from: before, to: project.name },
          }).catch(() => {
            console.error("recordActivity failed");
          });
        }
        return mapProject(project);
      });
    },

    async deleteProject(projectId) {
      return withDb(async () => {
        const project = await Project.findById(projectId);
        if (!project || project.deletedAt) {
          throw new ApiError(404, "not_found", "Project not found");
        }
        await requireMembership(userId, project.workspaceId.toString(), "admin");
        // Soft delete, like tasks: the project and its tasks drop out of every
        // listing, but the rows stay until the workspace itself is deleted.
        const now = new Date();
        project.deletedAt = now;
        await project.save();
        await TaskModel.updateMany(
          { projectId: project._id, deletedAt: null },
          { $set: { deletedAt: now } },
        );
        void recordActivity({
          workspaceId: project.workspaceId,
          projectId: project._id,
          actorId: userId,
          verb: "project.deleted",
          metadata: { name: project.name },
        }).catch(() => {
          console.error("recordActivity failed");
        });
      });
    },

    async createColumn(projectId, input) {
      return withDb(async () => {
        const project = await requireLiveProject(userId, projectId, "member");
        const count = await BoardColumn.countDocuments({ projectId: project._id });
        if (count >= MAX_COLUMNS) {
          throw new ApiError(400, "invalid_request", `A board can have up to ${MAX_COLUMNS} columns`);
        }
        const last = await BoardColumn.findOne({ projectId: project._id }).sort({ position: -1 }).lean();
        await BoardColumn.create({
          projectId: project._id,
          name: input.name.trim(),
          statusMapped: input.statusMapped,
          position: (last?.position ?? 0) + 1000,
        });
        return listColumns(project._id);
      });
    },

    async updateColumn(columnId, patch) {
      return withDb(async () => {
        const column = await BoardColumn.findById(oid(columnId));
        if (!column) throw new ApiError(404, "not_found", "Column not found");
        const project = await requireLiveProject(userId, column.projectId.toString(), "member");
        if (patch.statusMapped !== undefined && patch.statusMapped !== column.statusMapped) {
          await assertStatusKeepsAColumn(column);
          // Moving cards' status in bulk would skip completion mail and recurrence.
          if (await TaskModel.exists({ columnId: column._id, deletedAt: null })) {
            throw new ApiError(409, "column_not_empty", "Move this column's tasks out before changing its status");
          }
          column.statusMapped = patch.statusMapped;
        }
        if (patch.name !== undefined) column.name = patch.name.trim();
        await column.save();
        return { projectId: project._id.toString(), columns: await listColumns(project._id) };
      });
    },

    async deleteColumn(columnId) {
      return withDb(async () => {
        const column = await BoardColumn.findById(oid(columnId));
        if (!column) throw new ApiError(404, "not_found", "Column not found");
        const project = await requireLiveProject(userId, column.projectId.toString(), "member");
        const target = await assertStatusKeepsAColumn(column);
        // Cards keep their status and order, after the target's own cards.
        // Deleted tasks move too, so restoring one lands on a real column.
        const [last, moving] = await Promise.all([
          TaskModel.findOne({ columnId: target._id, deletedAt: null }).sort({ position: -1 }).select("position").lean(),
          TaskModel.find({ columnId: column._id }).sort({ position: 1 }).select("_id").lean(),
        ]);
        const base = last?.position ?? 0;
        if (moving.length) {
          await TaskModel.bulkWrite(moving.map((task, index) => ({
            updateOne: {
              filter: { _id: task._id, columnId: column._id },
              update: { $set: { columnId: target._id, position: base + (index + 1) * 1000 } },
            },
          })));
        }
        await column.deleteOne();
        return { projectId: project._id.toString(), columns: await listColumns(project._id) };
      });
    },

    async reorderColumns(projectId, columnIds) {
      return withDb(async () => {
        const project = await requireLiveProject(userId, projectId, "member");
        const current = await BoardColumn.find({ projectId: project._id }).select("_id").lean();
        const ids = [...new Set(columnIds.map((id) => id.toLowerCase()))];
        const known = new Set(current.map((column) => column._id.toString()));
        if (ids.length !== current.length || ids.some((id) => !known.has(id))) {
          throw new ApiError(409, "columns_changed", "The board's columns changed. Refresh and try again.");
        }
        await BoardColumn.bulkWrite(ids.map((id, index) => ({
          updateOne: { filter: { _id: oid(id), projectId: project._id }, update: { $set: { position: (index + 1) * 1000 } } },
        })));
        return listColumns(project._id);
      });
    },

    async listTasks(query: ListTasksQuery) {
      return withDb(async () => {
        await requireMembership(userId, query.workspaceId, "viewer");
        const filter: Record<string, unknown> = {
          workspaceId: oid(query.workspaceId),
        };
        if (!query.includeDeleted) {
          filter.deletedAt = null;
        }
        if (query.projectId === null) {
          filter.projectId = null;
        } else if (query.projectId) {
          filter.projectId = oid(query.projectId);
        }
        if (query.parentTaskId === null) {
          filter.parentTaskId = null;
        } else if (query.parentTaskId) {
          filter.parentTaskId = oid(query.parentTaskId);
        }
        if (query.status?.length) {
          filter.status = { $in: query.status };
        }
        if (query.priority?.length) {
          filter.priority = { $in: query.priority };
        }
        if (query.assigneeId) {
          filter.assigneeIds = oid(query.assigneeId);
        }
        if (query.tagIds?.length) {
          filter.tagIds = { $all: query.tagIds.map(oid) };
        }
        if (query.unscheduled) {
          filter.dueAt = null;
        } else if (query.dueBefore || query.dueAfter) {
          filter.dueAt = {
            ...(query.dueAfter ? { $gte: new Date(query.dueAfter) } : {}),
            ...(query.dueBefore ? { $lte: new Date(query.dueBefore) } : {}),
          };
        }
        if (query.search?.trim()) {
          filter.title = { $regex: escapeRegex(query.search.trim()), $options: "i" };
        }

        const tasks = await TaskModel.find(filter)
          .sort({ position: 1, createdAt: 1 })
          .lean();
        return tasks.map(mapTask);
      });
    },

    async getTask(taskId) {
      return withDb(async () => {
        const task = await requireTaskAccess(userId, taskId);
        return mapTask(task);
      });
    },

    async createTask(input: CreateTaskInput) {
      return withDb(async () => {
        await requireMembership(userId, input.workspaceId, "member");
        await assertTaskReferences(input.workspaceId, input);
        let columnId = input.columnId ? oid(input.columnId) : null;
        let status: TaskStatus = input.status ?? "todo";

        const [, mappedColumn] = await Promise.all([
          requireMembership(userId, input.workspaceId, "member"),
          input.projectId && !columnId
            ? firstColumnFor(oid(input.projectId), status)
            : Promise.resolve(null),
        ]);

        if (input.projectId && !columnId) {
          if (mappedColumn) {
            columnId = mappedColumn._id;
          } else {
            const first = await BoardColumn.findOne({
              projectId: oid(input.projectId),
            })
              .sort({ position: 1 })
              .lean();
            columnId = first?._id ?? null;
            // Adopt the column's status only when none was asked for: a status
            // with no column (canceled) must not silently become "todo".
            if (!input.status && first?.statusMapped) {
              status = first.statusMapped as TaskStatus;
            }
          }
        }

        const last = await TaskModel.findOne({
          workspaceId: oid(input.workspaceId),
          projectId: input.projectId ? oid(input.projectId) : null,
          columnId,
          deletedAt: null,
        })
          .sort({ position: -1 })
          .lean();

        const assigneeIds = [...new Set((input.assigneeIds ?? []).map((id) => id.toLowerCase()))];
        await assertAssigneesInWorkspace(input.workspaceId, assigneeIds);

        const task = await TaskModel.create({
          workspaceId: oid(input.workspaceId),
          projectId: input.projectId ? oid(input.projectId) : null,
          columnId,
          title: input.title.trim(),
          description: input.description ?? null,
          status,
          completedAt: status === "done" ? new Date() : null,
          completionDeliveries: status === "done" ? completionRecipients(oid(userId), assigneeIds.map(oid)) : [],
          priority: input.priority ?? "none",
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          dueHasTime: Boolean(input.dueAt && input.dueHasTime),
          startAt: input.startAt ? new Date(input.startAt) : null,
          deadlineAt: input.deadlineAt ? new Date(input.deadlineAt) : null,
          durationMinutes: input.durationMinutes ?? null,
          recurrence: asRecurrenceRule(input.recurrence),
          position: input.position ?? nextPosition(last?.position),
          assigneeIds: [...new Set(assigneeIds)].map(oid),
          emailDeliveries: [...new Set(assigneeIds)].map((id) => ({ userId: oid(id) })),
          tagIds: (input.tagIds ?? []).map(oid),
          parentTaskId: input.parentTaskId ? oid(input.parentTaskId) : null,
          createdById: oid(userId),
        });

        void recordActivity({
          workspaceId: task.workspaceId,
          projectId: task.projectId,
          taskId: task._id,
          actorId: userId,
          verb: "task.created",
          metadata: { title: task.title },
        }).catch(() => {
          console.error("recordActivity failed");
        });
        await notify({
          workspaceId: task.workspaceId,
          taskId: task._id,
          actorId: userId,
          kind: "assigned",
          recipientIds: assigneeIds,
        });

        return mapTask(task);
      });
    },

    async updateTask(taskId, patch: Partial<Task>) {
      return withDb(async () => {
        const task = await requireTaskAccess(userId, taskId);
        await requireMembership(userId, task.workspaceId.toString(), "member");

        const nextProject = patch.projectId !== undefined ? patch.projectId : task.projectId?.toString() ?? null;
        const projectChanges = nextProject !== (task.projectId?.toString() ?? null);
        await assertTaskReferences(task.workspaceId.toString(), {
          taskId,
          projectId: nextProject,
          columnId: patch.columnId !== undefined ? patch.columnId : projectChanges ? null : task.columnId?.toString() ?? null,
          parentTaskId: patch.parentTaskId !== undefined ? patch.parentTaskId : task.parentTaskId?.toString() ?? null,
          tagIds: patch.tagIds ?? task.tagIds.map((id) => id.toString()),
        });

        const before = {
          title: task.title,
          status: task.status,
          priority: task.priority,
          dueAt: task.dueAt?.toISOString() ?? null,
          startAt: task.startAt?.toISOString() ?? null,
          deadlineAt: task.deadlineAt?.toISOString() ?? null,
          durationMinutes: task.durationMinutes ?? null,
          assigneeIds: (task.assigneeIds ?? []).map((id) => id.toString()),
        };
        const becomingDone =
          patch.status === "done" && before.status !== "done";

        if (patch.assigneeIds !== undefined) {
          await assertAssigneesInWorkspace(
            task.workspaceId.toString(),
            patch.assigneeIds,
          );
        }

        if (patch.title !== undefined) task.title = patch.title.trim();
        if (patch.description !== undefined) {
          task.description = patch.description;
        }
        if (patch.priority !== undefined) task.priority = patch.priority;
        if (patch.dueAt !== undefined) {
          task.dueAt = patch.dueAt ? new Date(patch.dueAt) : null;
          // A new dueAt without the flag is a plain date, as older clients send.
          task.dueHasTime = Boolean(patch.dueAt && patch.dueHasTime);
        } else if (patch.dueHasTime !== undefined) {
          task.dueHasTime = Boolean(task.dueAt && patch.dueHasTime);
        }
        if (patch.startAt !== undefined) {
          task.startAt = patch.startAt ? new Date(patch.startAt) : null;
        }
        if (patch.deadlineAt !== undefined) {
          task.deadlineAt = patch.deadlineAt ? new Date(patch.deadlineAt) : null;
        }
        if (patch.durationMinutes !== undefined) {
          task.durationMinutes = patch.durationMinutes ?? null;
        }
        if (patch.position !== undefined) task.position = patch.position;
        if (patch.assigneeIds !== undefined) {
          const ids = [...new Set(patch.assigneeIds.map((id) => id.toLowerCase()))];
          task.assigneeIds = ids.map(oid);
          // Persist new assignment mail in the same write as the assignment itself.
          // Retained assignees keep their delivery state; removal cancels their jobs.
          if (!idsEqual(before.assigneeIds, ids)) {
            task.set("emailDeliveries", ids.map((id) =>
              (before.assigneeIds.includes(id) ? task.emailDeliveries?.find((job) => String(job.userId) === id) : undefined) ?? {
                userId: oid(id), assignmentPending: !before.assigneeIds.includes(id),
              },
            ));
          }
        }
        if (patch.tagIds !== undefined) {
          task.tagIds = patch.tagIds.map(oid);
        }
        if (patch.parentTaskId !== undefined) {
          task.parentTaskId = patch.parentTaskId
            ? oid(patch.parentTaskId)
            : null;
        }
        if (patch.projectId !== undefined) {
          const nextProjectId = patch.projectId ? oid(patch.projectId) : null;
          const projectChanged =
            (task.projectId?.toString() ?? null) !==
            (nextProjectId?.toString() ?? null);
          task.projectId = nextProjectId;
          if (projectChanged && patch.columnId === undefined) {
            if (!nextProjectId) {
              task.columnId = null;
            } else {
              const column = await firstColumnFor(nextProjectId, task.status);
              task.columnId = column?._id ?? null;
            }
          }
        }
        if (patch.columnId !== undefined) {
          task.columnId = patch.columnId ? oid(patch.columnId) : null;
        }
        if (patch.status !== undefined) {
          task.status = patch.status;
          if (patch.status === "done" && !task.completedAt) {
            task.completedAt = new Date();
          }
          if (patch.status !== "done") {
            task.completedAt = null;
          }

          // Stay in the current column if it already stands for this status
          // (several columns can share one); otherwise go to its first column.
          if (task.projectId && patch.columnId === undefined) {
            const fits = task.columnId && await BoardColumn.exists({
              _id: task.columnId,
              projectId: task.projectId,
              statusMapped: patch.status,
            });
            const column = fits ? null : await firstColumnFor(task.projectId, patch.status);
            if (column) {
              task.columnId = column._id;
            }
          }
        }
        if (patch.completedAt !== undefined) {
          task.completedAt = patch.completedAt
            ? new Date(patch.completedAt)
            : null;
        }
        if (patch.recurrence !== undefined) {
          const rule = asRecurrenceRule(patch.recurrence);
          task.recurrence = rule ? { ...rule, fromCompletion: Boolean(rule.fromCompletion) } : null;
        }
        if (patch.checklist !== undefined) {
          task.set(
            "checklist",
            patch.checklist.map((item, index) => ({
              ...(item.id && Types.ObjectId.isValid(item.id)
                ? { _id: oid(item.id) }
                : {}),
              title: item.title.trim(),
              completed: Boolean(item.completed),
              position: (index + 1) * 1000,
            })),
          );
        }

        const spawnRule = becomingDone
          ? asRecurrenceRule(task.recurrence)
          : null;
        if (spawnRule) {
          task.recurrence = null;
        }

        if (task.status !== before.status) {
          // The completion event and recipients persist atomically with the status.
          // A concurrent status change must not overwrite another completion event.
          task.$where = { status: before.status };
          task.set("completionDeliveries", becomingDone
            ? completionRecipients(task.createdById, task.assigneeIds)
            : []);
        }
        await task.save();
        if (spawnRule) {
          await spawnNextOccurrence(task, spawnRule, userId);
        }

        const mapped = mapTask(task);
        const afterAssignees = (task.assigneeIds ?? []).map((id) =>
          id.toString(),
        );
        const changes: Record<string, unknown> = {};
        if (patch.title !== undefined && patch.title.trim() !== before.title) {
          changes.title = { from: before.title, to: task.title };
        }
        if (patch.status !== undefined && patch.status !== before.status) {
          changes.status = { from: before.status, to: task.status };
        }
        if (
          patch.priority !== undefined &&
          patch.priority !== before.priority
        ) {
          changes.priority = { from: before.priority, to: task.priority };
        }
        if (patch.dueAt !== undefined) {
          const nextDue = task.dueAt?.toISOString() ?? null;
          if (nextDue !== before.dueAt) {
            changes.dueAt = { from: before.dueAt, to: nextDue };
          }
        }
        if (patch.startAt !== undefined) {
          const nextStart = task.startAt?.toISOString() ?? null;
          if (nextStart !== before.startAt) {
            changes.startAt = { from: before.startAt, to: nextStart };
          }
        }
        if (patch.deadlineAt !== undefined) {
          const nextDeadline = task.deadlineAt?.toISOString() ?? null;
          if (nextDeadline !== before.deadlineAt) {
            changes.deadlineAt = { from: before.deadlineAt, to: nextDeadline };
          }
        }
        if (patch.durationMinutes !== undefined && (task.durationMinutes ?? null) !== before.durationMinutes) {
          changes.durationMinutes = { from: before.durationMinutes, to: task.durationMinutes ?? null };
        }

        const activity: Array<Promise<unknown>> = [];
        if (!idsEqual(before.assigneeIds, afterAssignees)) {
          await notify({
            workspaceId: task.workspaceId,
            taskId: task._id,
            actorId: userId,
            kind: "assigned",
            recipientIds: afterAssignees.filter((id) => !before.assigneeIds.includes(id)),
          });
          activity.push(
            recordActivity({
              workspaceId: task.workspaceId,
              projectId: task.projectId,
              taskId: task._id,
              actorId: userId,
              verb: "task.assigned",
              metadata: {
                from: before.assigneeIds,
                to: afterAssignees,
              },
            }),
          );
        }
        if (Object.keys(changes).length > 0) {
          activity.push(
            recordActivity({
              workspaceId: task.workspaceId,
              projectId: task.projectId,
              taskId: task._id,
              actorId: userId,
              verb: "task.updated",
              metadata: changes,
            }),
          );
        }
        if (activity.length > 0) {
          void Promise.all(activity).catch(() => {
            console.error("recordActivity failed");
          });
        }

        return mapped;
      });
    },

    async deleteTask(taskId) {
      return withDb(async () => {
        const task = await requireTaskAccess(userId, taskId);
        await requireMembership(userId, task.workspaceId.toString(), "member");
        task.deletedAt = new Date();
        await task.save();
        // Its notifications can't be opened any more; don't leave them counted as unread.
        void Notification.updateMany({ taskId: task._id, readAt: null }, { $set: { readAt: new Date() } })
          .catch(() => console.error("notification cleanup failed"));
        const mapped = mapTask(task);
        void recordActivity({
          workspaceId: task.workspaceId,
          projectId: task.projectId,
          taskId: task._id,
          actorId: userId,
          verb: "task.deleted",
          metadata: { title: task.title },
        }).catch(() => {
          console.error("recordActivity failed");
        });
        return mapped;
      });
    },

    async listTrash(workspaceId) {
      return withDb(async () => {
        await requireMembership(userId, workspaceId, "viewer");
        const tasks = await TaskModel.find({
          workspaceId: oid(workspaceId),
          deletedAt: { $ne: null },
        })
          .sort({ deletedAt: -1 })
          .limit(TRASH_LIMIT)
          .lean();
        const projectIds = [...new Set(tasks.flatMap((task) => (task.projectId ? [task.projectId.toString()] : [])))];
        const projects = await Project.find({ _id: { $in: projectIds.map(oid) } })
          .select("name deletedAt")
          .lean();
        const byId = new Map(projects.map((project) => [project._id.toString(), project] as const));
        return tasks.map((task) => {
          const project = task.projectId ? byId.get(task.projectId.toString()) : undefined;
          return {
            task: mapTask(task),
            projectName: project?.name ?? null,
            projectDeleted: Boolean(task.projectId) && (!project || Boolean(project.deletedAt)),
          };
        });
      });
    },

    async restoreTask(taskId) {
      return withDb(async () => {
        const task = await TaskModel.findOne({ _id: oid(taskId), deletedAt: { $ne: null } });
        if (!task) throw new ApiError(404, "not_found", "Task is not in the trash");
        await requireMembership(userId, task.workspaceId.toString(), "member");

        // Put it back where it was if that place still exists; otherwise the Inbox.
        if (task.projectId && !await Project.exists({ _id: task.projectId, deletedAt: null })) {
          task.projectId = null;
          task.columnId = null;
        }
        if (task.projectId && (!task.columnId || !await BoardColumn.exists({ _id: task.columnId, projectId: task.projectId }))) {
          const column = await firstColumnFor(task.projectId, task.status)
            ?? await BoardColumn.findOne({ projectId: task.projectId }).sort({ position: 1 }).lean();
          task.columnId = column?._id ?? null;
        }
        // A subtask whose parent is gone would be hidden from every list.
        if (task.parentTaskId && !await TaskModel.exists({ _id: task.parentTaskId, deletedAt: null })) {
          task.parentTaskId = null;
        }
        task.deletedAt = null;
        await task.save();
        void recordActivity({
          workspaceId: task.workspaceId,
          projectId: task.projectId,
          taskId: task._id,
          actorId: userId,
          verb: "task.restored",
          metadata: { title: task.title },
        }).catch(() => {
          console.error("recordActivity failed");
        });
        return mapTask(task);
      });
    },

    async reorderTasks(input: ReorderTasksInput) {
      return withDb(async () => {
        const project = await Project.findById(input.projectId).lean();
        if (!project || project.deletedAt) {
          throw new ApiError(404, "not_found", "Project not found");
        }
        await requireMembership(
          userId,
          project.workspaceId.toString(),
          "member",
        );

        for (const columnId of new Set(input.moves.map((move) => move.columnId).filter(Boolean))) {
          await assertTaskReferences(project.workspaceId.toString(), { projectId: input.projectId, columnId });
        }
        const tasks = await TaskModel.find({
          _id: { $in: input.moves.map((move) => oid(move.taskId)) },
          projectId: oid(input.projectId),
          workspaceId: project.workspaceId,
          deletedAt: null,
        });
        const byId = new Map(
          tasks.map((task) => [task._id.toString(), task] as const),
        );

        const ops: Array<{
          updateOne: {
            filter: { _id: Types.ObjectId; status: TaskStatus };
            update: { $set: Record<string, unknown> };
          };
        }> = [];
        const spawnJobs: Array<{
          source: HydratedDocument<TaskDocument>;
          rule: RecurrenceRule;
        }> = [];
        const updated: Task[] = [];

        for (const move of input.moves) {
          const task = byId.get(move.taskId);
          if (!task) continue;

          const becomingDone =
            move.status === "done" && task.status !== "done";
          const spawnRule = becomingDone
            ? asRecurrenceRule(task.recurrence)
            : null;

          const nextColumnId = move.columnId ? oid(move.columnId) : null;
          const nextCompletedAt = move.status
            ? move.status === "done"
              ? (task.completedAt ?? new Date())
              : null
            : task.completedAt;

          const $set: Record<string, unknown> = {
            columnId: nextColumnId,
            position: move.position,
          };
          if (move.status) {
            $set.status = move.status;
            $set.completedAt = nextCompletedAt;
            if (move.status !== task.status) {
              $set.completionDeliveries = becomingDone
                ? completionRecipients(task.createdById, task.assigneeIds)
                : [];
            }
          }
          if (spawnRule) {
            $set.recurrence = null;
          }

          ops.push({
            updateOne: {
              filter: { _id: task._id, status: task.status },
              update: { $set },
            },
          });

          task.columnId = nextColumnId;
          task.position = move.position;
          if (move.status) {
            task.status = move.status;
            task.completedAt = nextCompletedAt;
          }
          if (spawnRule) {
            task.recurrence = null;
            spawnJobs.push({ source: task, rule: spawnRule });
          }
          updated.push(mapTask(task));
        }

        if (ops.length > 0) {
          const result = await TaskModel.bulkWrite(ops);
          if (result.matchedCount !== ops.length) {
            throw new ApiError(409, "task_changed", "A task changed while moving it. Refresh and try again.");
          }
        }
        await Promise.all(
          spawnJobs.map((job) =>
            spawnNextOccurrence(job.source, job.rule, userId),
          ),
        );
        return updated;
      });
    },

    async listTags(workspaceId) {
      return withDb(async () => {
        await requireMembership(userId, workspaceId, "viewer");
        const tags = await Tag.find({ workspaceId: oid(workspaceId) })
          .sort({ name: 1 })
          .lean();
        return tags.map(mapTag);
      });
    },

    async createTag(workspaceId, input) {
      return withDb(async () => {
        await requireMembership(userId, workspaceId, "member");
        const name = input.name.trim();
        if (!name) {
          throw new ApiError(400, "invalid_request", "Tag name is required");
        }
        const existing = await Tag.findOne({
          workspaceId: oid(workspaceId),
          name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
        }).lean();
        if (existing) return mapTag(existing);
        const tag = await Tag.create({
          workspaceId: oid(workspaceId),
          name,
          color: input.color || "#52D3FE",
        });
        return mapTag(tag);
      });
    },

    async listComments(taskId) {
      return withDb(async () => {
        await requireTaskAccess(userId, taskId);
        const comments = await Comment.find({
          taskId: oid(taskId),
          deletedAt: null,
        })
          .sort({ createdAt: 1 })
          .lean();
        return comments.map(mapComment);
      });
    },

    async createComment(input) {
      return withDb(async () => {
        const task = await requireTaskAccess(userId, input.taskId);
        await requireMembership(userId, task.workspaceId.toString(), "member");
        const { body, mentions, recipientIds } = checkCommentBody(input);
        await assertAssigneesInWorkspace(task.workspaceId.toString(), recipientIds);
        const comment = await Comment.create({
          workspaceId: task.workspaceId,
          taskId: task._id,
          authorId: oid(userId),
          body,
          mentions: mentions.map((mention) => ({ ...mention, userId: oid(mention.userId) })),
          mentionDeliveries: recipientIds.map((id) => ({ userId: oid(id) })),
        });
        await recordActivity({
          workspaceId: task.workspaceId,
          projectId: task.projectId,
          taskId: task._id,
          actorId: userId,
          verb: "comment.created",
          metadata: { commentId: comment._id.toString() },
        });
        // Tagged people get a mention; the task's assignees and creator a comment.
        await notify({
          workspaceId: task.workspaceId,
          taskId: task._id,
          commentId: comment._id,
          actorId: userId,
          kind: "mention",
          recipientIds,
        });
        await notify({
          workspaceId: task.workspaceId,
          taskId: task._id,
          commentId: comment._id,
          actorId: userId,
          kind: "comment",
          recipientIds: [task.createdById, ...task.assigneeIds]
            .map(String)
            .filter((id) => !recipientIds.includes(id)),
        });
        return mapComment(comment);
      });
    },

    async updateComment(commentId, input) {
      return withDb(async () => {
        const comment = await Comment.findOne({ _id: oid(commentId), deletedAt: null });
        if (!comment) throw new ApiError(404, "not_found", "Comment not found");
        const task = await requireTaskAccess(userId, comment.taskId.toString());
        await requireMembership(userId, task.workspaceId.toString(), "member");
        if (comment.authorId.toString() !== userId) {
          throw new ApiError(403, "forbidden", "You can only edit your own comments");
        }
        const { body, mentions, recipientIds } = checkCommentBody(input);
        await assertAssigneesInWorkspace(task.workspaceId.toString(), recipientIds);
        // Only people tagged for the first time get mail; existing jobs keep their state.
        const queued = new Set((comment.mentionDeliveries ?? []).map((job) => String(job.userId)));
        const added = recipientIds.filter((id) => !queued.has(id));
        if (body !== comment.body) comment.editedAt = new Date();
        comment.body = body;
        comment.set("mentions", mentions.map((mention) => ({ ...mention, userId: oid(mention.userId) })));
        if (added.length) {
          comment.set("mentionDeliveries", [
            ...(comment.mentionDeliveries ?? []),
            ...added.map((id) => ({ userId: oid(id) })),
          ]);
        }
        await comment.save();
        await notify({
          workspaceId: task.workspaceId,
          taskId: task._id,
          commentId: comment._id,
          actorId: userId,
          kind: "mention",
          recipientIds: added,
        });
        return { comment: mapComment(comment), projectId: task.projectId?.toString() ?? null };
      });
    },

    async deleteComment(commentId) {
      return withDb(async () => {
        const comment = await Comment.findOne({ _id: oid(commentId), deletedAt: null });
        if (!comment) throw new ApiError(404, "not_found", "Comment not found");
        const task = await requireTaskAccess(userId, comment.taskId.toString());
        const role = await requireMembership(userId, task.workspaceId.toString(), "viewer");
        const isAuthor = comment.authorId.toString() === userId;
        if (!isAuthor && role !== "admin" && role !== "owner") {
          throw new ApiError(403, "forbidden", "You can only delete your own comments");
        }
        comment.deletedAt = new Date();
        await comment.save();
        void Notification.deleteMany({ commentId: comment._id })
          .catch(() => console.error("notification cleanup failed"));
        void recordActivity({
          workspaceId: task.workspaceId,
          projectId: task.projectId,
          taskId: task._id,
          actorId: userId,
          verb: "comment.deleted",
          metadata: { commentId, byAuthor: isAuthor },
        }).catch(() => {
          console.error("recordActivity failed");
        });
        return { taskId: task._id.toString(), projectId: task.projectId?.toString() ?? null };
      });
    },

    async listActivity(query) {
      return withDb(async () => {
        await requireMembership(userId, query.workspaceId, "viewer");
        const filter: Record<string, unknown> = {
          workspaceId: oid(query.workspaceId),
        };
        if (query.taskId) {
          filter.taskId = oid(query.taskId);
        }
        if (query.cursor && Types.ObjectId.isValid(query.cursor)) {
          filter._id = { $lt: oid(query.cursor) };
        }
        const limit = 40;
        const events = await ActivityEvent.find(filter)
          .sort({ _id: -1 })
          .limit(limit + 1)
          .lean();
        const hasMore = events.length > limit;
        const page = hasMore ? events.slice(0, limit) : events;
        return {
          items: page.map(mapActivity),
          nextCursor: hasMore
            ? page[page.length - 1]?._id.toString()
            : undefined,
        };
      });
    },
  };
}
