import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Goal, Task, type GoalDocument } from "@/src/server/models";
import { requireWorkspaceRole } from "@/src/server/workspace/members";
import { rollUp, type Goal as GoalDto } from "@/src/core/goals";

const MAX_GOALS = 100;
const MAX_MILESTONES = 30;

type GoalPatch = { name?: string; description?: string | null; targetAt?: string | null; archived?: boolean };
type MilestonePatch = { name?: string; dueAt?: string | null };

const iso = (date: Date | null | undefined) => (date ? date.toISOString() : null);

/** Goals with their task counts rolled up, in creation order. */
async function withProgress(docs: GoalDocument[]): Promise<GoalDto[]> {
  if (!docs.length) return [];
  const rows = await Task.aggregate<{ _id: { goalId: Types.ObjectId; milestoneId: Types.ObjectId | null }; done: number; total: number }>([
    { $match: { goalId: { $in: docs.map((doc) => doc._id) }, deletedAt: null, status: { $ne: "canceled" } } },
    {
      $group: {
        _id: { goalId: "$goalId", milestoneId: { $ifNull: ["$milestoneId", null] } },
        done: { $sum: { $cond: [{ $eq: ["$status", "done"] }, 1, 0] } },
        total: { $sum: 1 },
      },
    },
  ]);
  return docs.map((doc) => {
    const mine = rows
      .filter((row) => String(row._id.goalId) === String(doc._id))
      .map((row) => ({ milestoneId: row._id.milestoneId ? String(row._id.milestoneId) : null, done: row.done, total: row.total }));
    const milestones = doc.milestones ?? [];
    const { goal, byMilestone } = rollUp(milestones.map((m) => String(m._id)), mine);
    return {
      id: String(doc._id),
      workspaceId: String(doc.workspaceId),
      name: doc.name,
      description: doc.description ?? null,
      targetAt: iso(doc.targetAt),
      archived: Boolean(doc.archivedAt),
      milestones: milestones.map((m) => ({
        id: String(m._id), name: m.name, dueAt: iso(m.dueAt), progress: byMilestone.get(String(m._id))!,
      })),
      progress: goal,
    };
  });
}

async function requireGoal(userId: string, goalId: string, minRole: "viewer" | "member") {
  const goal = await Goal.findById(new Types.ObjectId(goalId));
  if (!goal) throw new ApiError(404, "not_found", "Goal not found");
  await requireWorkspaceRole(userId, String(goal.workspaceId), minRole);
  return goal;
}

async function one(goal: GoalDocument) {
  return (await withProgress([goal]))[0]!;
}

export function listGoals(userId: string, workspaceId: string) {
  return withDb(async () => {
    await requireWorkspaceRole(userId, workspaceId, "viewer");
    const docs = await Goal.find({ workspaceId: new Types.ObjectId(workspaceId) }).sort({ createdAt: 1 }).lean();
    return withProgress(docs as GoalDocument[]);
  });
}

export function getGoal(userId: string, goalId: string) {
  return withDb(async () => one((await requireGoal(userId, goalId, "viewer")).toObject()));
}

export function createGoal(userId: string, workspaceId: string, input: { name: string; description?: string | null; targetAt?: string | null }) {
  return withDb(async () => {
    await requireWorkspaceRole(userId, workspaceId, "member");
    const workspace = new Types.ObjectId(workspaceId);
    if (await Goal.countDocuments({ workspaceId: workspace }) >= MAX_GOALS) {
      throw new ApiError(400, "limit_reached", `A workspace can have up to ${MAX_GOALS} goals.`);
    }
    const doc = await Goal.create({
      workspaceId: workspace,
      name: input.name,
      description: input.description ?? null,
      targetAt: input.targetAt ? new Date(input.targetAt) : null,
      createdById: new Types.ObjectId(userId),
    });
    return one(doc.toObject());
  });
}

export function updateGoal(userId: string, goalId: string, patch: GoalPatch) {
  return withDb(async () => {
    const goal = await requireGoal(userId, goalId, "member");
    if (patch.name !== undefined) goal.name = patch.name;
    if (patch.description !== undefined) goal.description = patch.description || null;
    if (patch.targetAt !== undefined) goal.targetAt = patch.targetAt ? new Date(patch.targetAt) : null;
    if (patch.archived !== undefined) goal.archivedAt = patch.archived ? goal.archivedAt ?? new Date() : null;
    await goal.save();
    return one(goal.toObject());
  });
}

/** Deletes the goal; its tasks stay, unlinked. */
export function deleteGoal(userId: string, goalId: string) {
  return withDb(async () => {
    const goal = await requireGoal(userId, goalId, "member");
    await Task.updateMany({ goalId: goal._id }, { $set: { goalId: null, milestoneId: null } });
    await goal.deleteOne();
  });
}

export function addMilestone(userId: string, goalId: string, input: { name: string; dueAt?: string | null }) {
  return withDb(async () => {
    const goal = await requireGoal(userId, goalId, "member");
    if (goal.milestones.length >= MAX_MILESTONES) {
      throw new ApiError(400, "limit_reached", `A goal can have up to ${MAX_MILESTONES} milestones.`);
    }
    goal.milestones.push({ name: input.name, dueAt: input.dueAt ? new Date(input.dueAt) : null });
    await goal.save();
    return one(goal.toObject());
  });
}

function findMilestone(goal: Awaited<ReturnType<typeof requireGoal>>, milestoneId: string) {
  const milestone = goal.milestones.id(milestoneId);
  if (!milestone) throw new ApiError(404, "not_found", "Milestone not found");
  return milestone;
}

export function updateMilestone(userId: string, goalId: string, milestoneId: string, patch: MilestonePatch) {
  return withDb(async () => {
    const goal = await requireGoal(userId, goalId, "member");
    const milestone = findMilestone(goal, milestoneId);
    if (patch.name !== undefined) milestone.name = patch.name;
    if (patch.dueAt !== undefined) milestone.dueAt = patch.dueAt ? new Date(patch.dueAt) : null;
    await goal.save();
    return one(goal.toObject());
  });
}

/** Removes the milestone; its tasks stay on the goal. */
export function deleteMilestone(userId: string, goalId: string, milestoneId: string) {
  return withDb(async () => {
    const goal = await requireGoal(userId, goalId, "member");
    const milestone = findMilestone(goal, milestoneId);
    await Task.updateMany({ goalId: goal._id, milestoneId: milestone._id }, { $set: { milestoneId: null } });
    milestone.deleteOne();
    await goal.save();
    return one(goal.toObject());
  });
}

/** A task's goal must be in its workspace, and its milestone on that goal. */
export async function assertGoalLink(workspaceId: Types.ObjectId | string, goalId: string | null, milestoneId: string | null) {
  if (!goalId) {
    if (milestoneId) throw new ApiError(400, "invalid_request", "A milestone needs its goal");
    return;
  }
  const goal = await Goal.findOne({ _id: new Types.ObjectId(goalId), workspaceId: new Types.ObjectId(String(workspaceId)) }).select("milestones._id").lean();
  if (!goal) throw new ApiError(403, "forbidden", "Goal is not in this workspace");
  if (milestoneId && !goal.milestones.some((m) => String(m._id) === milestoneId)) {
    throw new ApiError(403, "forbidden", "Milestone is not on this goal");
  }
}
