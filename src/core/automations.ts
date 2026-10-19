import { TASK_PRIORITIES, TASK_STATUSES, type TaskPriority, type TaskStatus } from "@/src/core/models/enums";
import { noonInDays } from "@/src/core/recurrence/next";
import type { Task } from "@/src/core/sync/types";

/** When a rule runs. `to` narrows a change to one value. */
export type AutomationTrigger =
  | { type: "created" }
  | { type: "status_changed"; to?: TaskStatus | null }
  | { type: "priority_changed"; to?: TaskPriority | null }
  | { type: "assignee_added" };

/** Every condition must hold for the task as it is after the change. */
export type AutomationCondition =
  | { type: "priority_is"; value: TaskPriority }
  | { type: "has_tag"; value: string }
  | { type: "assigned_to"; value: string }
  | { type: "in_section"; value: string }
  | { type: "title_contains"; value: string };

export type AutomationAction =
  | { type: "set_status"; value: TaskStatus }
  | { type: "set_priority"; value: TaskPriority }
  | { type: "add_tag"; value: string }
  | { type: "add_assignee"; value: string }
  | { type: "move_to_section"; value: string }
  | { type: "set_due_in_days"; value: number };

export type AutomationRule = {
  id: string;
  projectId: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  /** The zone dates in actions are counted in (the creator's). */
  timeZone: string;
  runCount: number;
  lastRunAt: string | null;
};

export const MAX_RULES = 25;
export const MAX_STEPS = 5;

/** What happened to a task, worked out from before and after. */
export type TaskEvent =
  | { type: "created" }
  | { type: "status_changed"; to: TaskStatus }
  | { type: "priority_changed"; to: TaskPriority }
  | { type: "assignee_added" };

type Snapshot = Pick<Task, "status" | "priority" | "assigneeIds">;

export function taskEvents(before: Snapshot | null, after: Snapshot): TaskEvent[] {
  if (!before) return [{ type: "created" }];
  const events: TaskEvent[] = [];
  if (before.status !== after.status) events.push({ type: "status_changed", to: after.status });
  if (before.priority !== after.priority) events.push({ type: "priority_changed", to: after.priority });
  if (after.assigneeIds.some((id) => !before.assigneeIds.includes(id))) events.push({ type: "assignee_added" });
  return events;
}

export function matchesTrigger(trigger: AutomationTrigger, events: TaskEvent[]) {
  return events.some((event) => {
    if (event.type !== trigger.type) return false;
    if ((trigger.type === "status_changed" || trigger.type === "priority_changed") && trigger.to) {
      return "to" in event && event.to === trigger.to;
    }
    return true;
  });
}

type Subject = Pick<Task, "priority" | "tagIds" | "assigneeIds" | "sectionId" | "title">;

export function matchesConditions(conditions: AutomationCondition[], task: Subject) {
  return conditions.every((condition) => {
    switch (condition.type) {
      case "priority_is": return task.priority === condition.value;
      case "has_tag": return task.tagIds.includes(condition.value);
      case "assigned_to": return task.assigneeIds.includes(condition.value);
      case "in_section": return task.sectionId === condition.value;
      case "title_contains": return task.title.toLowerCase().includes(condition.value.trim().toLowerCase());
    }
  });
}

/** The patch a rule's actions make, leaving out anything already true. */
export function planActions(actions: AutomationAction[], task: Subject & Pick<Task, "status" | "dueAt">, now: Date, timeZone: string): Partial<Task> {
  const patch: Partial<Task> = {};
  for (const action of actions) {
    switch (action.type) {
      case "set_status":
        if (task.status !== action.value) patch.status = action.value;
        break;
      case "set_priority":
        if (task.priority !== action.value) patch.priority = action.value;
        break;
      case "add_tag": {
        const tags = patch.tagIds ?? task.tagIds;
        if (!tags.includes(action.value)) patch.tagIds = [...tags, action.value];
        break;
      }
      case "add_assignee": {
        const people = patch.assigneeIds ?? task.assigneeIds;
        if (!people.includes(action.value)) patch.assigneeIds = [...people, action.value];
        break;
      }
      case "move_to_section":
        if (task.sectionId !== action.value) patch.sectionId = action.value;
        break;
      case "set_due_in_days": {
        const dueAt = noonInDays(now, action.value, timeZone).toISOString();
        if (task.dueAt !== dueAt) { patch.dueAt = dueAt; patch.dueHasTime = false; }
        break;
      }
    }
  }
  return patch;
}

export const STATUS_LABEL: Record<TaskStatus, string> = { todo: "Todo", in_progress: "In progress", done: "Done", canceled: "Canceled" };
export const PRIORITY_LABEL: Record<TaskPriority, string> = { none: "None", low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };
export { TASK_PRIORITIES, TASK_STATUSES };

/** Names for ids a rule points at (tags, people, sections). */
export type RuleNames = { tag: (id: string) => string; person: (id: string) => string; section: (id: string) => string };

export function describeTrigger(trigger: AutomationTrigger) {
  switch (trigger.type) {
    case "created": return "a task is created";
    case "status_changed": return trigger.to ? `a task moves to ${STATUS_LABEL[trigger.to]}` : "a task's status changes";
    case "priority_changed": return trigger.to ? `a task's priority becomes ${PRIORITY_LABEL[trigger.to]}` : "a task's priority changes";
    case "assignee_added": return "someone is assigned";
  }
}

export function describeCondition(condition: AutomationCondition, names: RuleNames) {
  switch (condition.type) {
    case "priority_is": return `priority is ${PRIORITY_LABEL[condition.value]}`;
    case "has_tag": return `it has tag ${names.tag(condition.value)}`;
    case "assigned_to": return `it's assigned to ${names.person(condition.value)}`;
    case "in_section": return `it's in ${names.section(condition.value)}`;
    case "title_contains": return `the title contains “${condition.value}”`;
  }
}

export function describeAction(action: AutomationAction, names: RuleNames) {
  switch (action.type) {
    case "set_status": return `set status to ${STATUS_LABEL[action.value]}`;
    case "set_priority": return `set priority to ${PRIORITY_LABEL[action.value]}`;
    case "add_tag": return `add tag ${names.tag(action.value)}`;
    case "add_assignee": return `assign ${names.person(action.value)}`;
    case "move_to_section": return `move to ${names.section(action.value)}`;
    case "set_due_in_days": return action.value === 0 ? "make it due today" : `make it due in ${action.value} day${action.value === 1 ? "" : "s"}`;
  }
}

/** "When …, if … and …, then … and …". */
export function describeRule(rule: Pick<AutomationRule, "trigger" | "conditions" | "actions">, names: RuleNames) {
  const when = `When ${describeTrigger(rule.trigger)}`;
  const condition = rule.conditions.length ? `, if ${rule.conditions.map((c) => describeCondition(c, names)).join(" and ")}` : "";
  const then = `, then ${rule.actions.map((a) => describeAction(a, names)).join(" and ")}`;
  return `${when}${condition}${then}.`;
}
