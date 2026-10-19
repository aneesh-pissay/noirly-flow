import { AsyncLocalStorage } from "node:async_hooks";
import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { AutomationRule, Project, Section, Tag, Task, WorkspaceMembership, type AutomationRuleDocument } from "@/src/server/models";
import { requireWorkspaceRole } from "@/src/server/workspace/members";
import { recordActivity } from "@/src/server/activity";
import { isTimeZone } from "@/src/core/recurrence/next";
import {
  MAX_RULES, matchesConditions, matchesTrigger, planActions, taskEvents,
  type AutomationAction, type AutomationCondition, type AutomationRule as RuleDto, type AutomationTrigger,
} from "@/src/core/automations";
import type { SyncProvider, Task as TaskDto } from "@/src/core/sync/types";

const oid = (id: string) => new Types.ObjectId(id);

type RuleInput = {
  name: string;
  enabled?: boolean;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  timeZone?: string;
};

function map(doc: AutomationRuleDocument): RuleDto {
  return {
    id: String(doc._id),
    projectId: String(doc.projectId),
    name: doc.name,
    enabled: doc.enabled,
    trigger: doc.trigger as AutomationTrigger,
    conditions: (doc.conditions ?? []) as AutomationCondition[],
    actions: (doc.actions ?? []) as AutomationAction[],
    timeZone: doc.timeZone,
    runCount: doc.runCount ?? 0,
    lastRunAt: doc.lastRunAt ? doc.lastRunAt.toISOString() : null,
  };
}

async function requireProject(userId: string, projectId: string, minRole: "viewer" | "member") {
  const project = await Project.findOne({ _id: oid(projectId), deletedAt: null }).select("workspaceId").lean();
  if (!project) throw new ApiError(404, "not_found", "Project not found");
  await requireWorkspaceRole(userId, String(project.workspaceId), minRole);
  return project;
}

async function requireRule(userId: string, ruleId: string) {
  const rule = await AutomationRule.findById(oid(ruleId));
  if (!rule) throw new ApiError(404, "not_found", "Automation not found");
  await requireProject(userId, String(rule.projectId), "member");
  return rule;
}

/** Tags, people and sections a rule names must be in its workspace or project. */
async function assertReferences(workspaceId: Types.ObjectId, projectId: Types.ObjectId, input: Pick<RuleInput, "conditions" | "actions">) {
  const steps = [...input.conditions, ...input.actions] as Array<{ type: string; value: unknown }>;
  const ids = (types: string[]) => [...new Set(steps.filter((s) => types.includes(s.type)).map((s) => String(s.value)))];
  const bad = (what: string) => new ApiError(400, "invalid_request", `A rule points at a ${what} that isn't here`);
  const tags = ids(["has_tag", "add_tag"]);
  if (tags.length && await Tag.countDocuments({ _id: { $in: tags.map(oid) }, workspaceId }) !== tags.length) throw bad("tag");
  const people = ids(["assigned_to", "add_assignee"]);
  if (people.length && await WorkspaceMembership.countDocuments({ workspaceId, userId: { $in: people.map(oid) } }) !== people.length) throw bad("person");
  const sections = ids(["in_section", "move_to_section"]);
  if (sections.length && await Section.countDocuments({ _id: { $in: sections.map(oid) }, projectId }) !== sections.length) throw bad("section");
}

export function listRules(userId: string, projectId: string) {
  return withDb(async () => {
    await requireProject(userId, projectId, "viewer");
    const docs = await AutomationRule.find({ projectId: oid(projectId) }).sort({ createdAt: 1 }).lean();
    return docs.map((doc) => map(doc as AutomationRuleDocument));
  });
}

export function createRule(userId: string, projectId: string, input: RuleInput) {
  return withDb(async () => {
    const project = await requireProject(userId, projectId, "member");
    if (await AutomationRule.countDocuments({ projectId: oid(projectId) }) >= MAX_RULES) {
      throw new ApiError(400, "limit_reached", `A project can have up to ${MAX_RULES} automations.`);
    }
    await assertReferences(project.workspaceId, oid(projectId), input);
    const doc = await AutomationRule.create({
      workspaceId: project.workspaceId,
      projectId: oid(projectId),
      name: input.name,
      enabled: input.enabled ?? true,
      trigger: input.trigger,
      conditions: input.conditions,
      actions: input.actions,
      timeZone: isTimeZone(input.timeZone) ? input.timeZone : "UTC",
      createdById: oid(userId),
    });
    return map(doc.toObject());
  });
}

export function updateRule(userId: string, ruleId: string, patch: Partial<RuleInput>) {
  return withDb(async () => {
    const rule = await requireRule(userId, ruleId);
    const next = {
      conditions: patch.conditions ?? (rule.conditions as AutomationCondition[]),
      actions: patch.actions ?? (rule.actions as AutomationAction[]),
    };
    if (patch.conditions || patch.actions) await assertReferences(rule.workspaceId, rule.projectId, next);
    if (patch.name !== undefined) rule.name = patch.name;
    if (patch.enabled !== undefined) rule.enabled = patch.enabled;
    if (patch.trigger !== undefined) rule.trigger = patch.trigger;
    if (patch.conditions !== undefined) rule.conditions = patch.conditions;
    if (patch.actions !== undefined) rule.actions = patch.actions;
    if (patch.timeZone !== undefined && isTimeZone(patch.timeZone)) rule.timeZone = patch.timeZone;
    rule.markModified("trigger");
    await rule.save();
    return map(rule.toObject());
  });
}

export function deleteRule(userId: string, ruleId: string) {
  return withDb(async () => {
    const rule = await requireRule(userId, ruleId);
    await rule.deleteOne();
  });
}

// Changes made by a rule don't trigger rules again, so rules can't loop.
const runningRules = new AsyncLocalStorage<true>();

type Snapshot = Pick<TaskDto, "status" | "priority" | "assigneeIds">;

/**
 * Runs the project's enabled rules that match what just happened to a task,
 * as the person who made the change. A rule that fails (say, its tag was
 * deleted, or the task is blocked) is skipped; the change itself stands.
 */
async function runRules(sync: SyncProvider, userId: string, before: Snapshot | null, task: TaskDto): Promise<TaskDto> {
  if (!task.projectId) return task;
  const events = taskEvents(before, task);
  if (!events.length) return task;
  const rules = await withDb(() => AutomationRule.find({ projectId: oid(task.projectId!), enabled: true }).sort({ createdAt: 1 }).lean());
  let current = task;
  for (const raw of rules) {
    const rule = map(raw as AutomationRuleDocument);
    if (!matchesTrigger(rule.trigger, events) || !matchesConditions(rule.conditions, current)) continue;
    const patch = planActions(rule.actions, current, new Date(), rule.timeZone);
    if (!Object.keys(patch).length) continue;
    try {
      current = await runningRules.run(true, () => sync.updateTask(current.id, patch));
      await withDb(async () => {
        await AutomationRule.updateOne({ _id: raw._id }, { $inc: { runCount: 1 }, $set: { lastRunAt: new Date() } });
        await recordActivity({
          workspaceId: current.workspaceId, projectId: current.projectId, taskId: current.id, actorId: userId,
          verb: "automation.ran", metadata: { rule: rule.name, ruleId: rule.id },
        });
      });
    } catch {
      console.error("automation rule failed");
    }
  }
  return current;
}

/** The provider, with project automations run after task creates and updates. */
export function withAutomations(sync: SyncProvider, userId: string): SyncProvider {
  return {
    ...sync,
    async createTask(input) {
      const task = await sync.createTask(input);
      if (runningRules.getStore() || !task.projectId) return task;
      return runRules(sync, userId, null, task);
    },
    async updateTask(taskId, patch) {
      if (runningRules.getStore()) return sync.updateTask(taskId, patch);
      // Read only what's needed to tell what changed, and skip it all for projects without rules.
      const before = await withDb(async () => {
        const row = await Task.findOne({ _id: oid(taskId), deletedAt: null }).select("projectId status priority assigneeIds").lean();
        if (!row?.projectId || !await AutomationRule.exists({ projectId: row.projectId, enabled: true })) return null;
        return { status: row.status, priority: row.priority, assigneeIds: (row.assigneeIds ?? []).map(String) } as Snapshot;
      });
      const task = await sync.updateTask(taskId, patch);
      return before ? runRules(sync, userId, before, task) : task;
    },
  };
}
