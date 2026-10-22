import { describe, expect, it } from "vitest";
import {
  describeRule, matchesConditions, matchesTrigger, planActions, taskEvents,
} from "@/src/core/automations";
import type { Task } from "@/src/core/sync/types";

const task = (extra: Partial<Task> = {}) => ({
  status: "todo", priority: "none", assigneeIds: [], tagIds: [], sectionId: null, title: "Fix login bug", dueAt: null, ...extra,
}) as Task;

describe("taskEvents and matchesTrigger", () => {
  it("works out what changed", () => {
    expect(taskEvents(null, task())).toEqual([{ type: "created" }]);
    expect(taskEvents(task(), task({ status: "done", priority: "high", assigneeIds: ["u1"] }))).toEqual([
      { type: "status_changed", to: "done" },
      { type: "priority_changed", to: "high" },
      { type: "assignee_added" },
    ]);
    expect(taskEvents(task({ assigneeIds: ["u1"] }), task())).toEqual([]);
  });

  it("matches a trigger, narrowed by its target value", () => {
    const done = [{ type: "status_changed", to: "done" }] as const;
    expect(matchesTrigger({ type: "status_changed" }, [...done])).toBe(true);
    expect(matchesTrigger({ type: "status_changed", to: "done" }, [...done])).toBe(true);
    expect(matchesTrigger({ type: "status_changed", to: "in_progress" }, [...done])).toBe(false);
    expect(matchesTrigger({ type: "created" }, [...done])).toBe(false);
  });
});

describe("matchesConditions", () => {
  it("needs every condition", () => {
    const subject = task({ priority: "high", tagIds: ["t1"], assigneeIds: ["u1"], sectionId: "s1" });
    expect(matchesConditions([], subject)).toBe(true);
    expect(matchesConditions([
      { type: "priority_is", value: "high" },
      { type: "has_tag", value: "t1" },
      { type: "assigned_to", value: "u1" },
      { type: "in_section", value: "s1" },
      { type: "title_contains", value: "LOGIN" },
    ], subject)).toBe(true);
    expect(matchesConditions([{ type: "priority_is", value: "high" }, { type: "has_tag", value: "t2" }], subject)).toBe(false);
  });
});

describe("planActions", () => {
  it("builds one patch and skips what's already true", () => {
    const now = new Date("2026-10-19T20:00:00Z"); // already the 20th in Kolkata
    const patch = planActions([
      { type: "set_status", value: "in_progress" },
      { type: "set_priority", value: "none" },
      { type: "add_tag", value: "t1" },
      { type: "add_tag", value: "t2" },
      { type: "add_assignee", value: "u1" },
      { type: "move_to_section", value: "s1" },
      { type: "set_due_in_days", value: 2 },
    ], task({ tagIds: ["t1"] }), now, "Asia/Kolkata");
    expect(patch).toEqual({
      status: "in_progress",
      tagIds: ["t1", "t2"],
      assigneeIds: ["u1"],
      sectionId: "s1",
      dueAt: "2026-10-22T06:30:00.000Z",
      dueHasTime: false,
    });
  });
});

describe("describeRule", () => {
  it("reads as a sentence", () => {
    const names = { tag: () => "#urgent", person: () => "Sam", section: () => "Review" };
    expect(describeRule({
      trigger: { type: "status_changed", to: "done" },
      conditions: [{ type: "priority_is", value: "high" }],
      actions: [{ type: "add_tag", value: "t" }, { type: "add_assignee", value: "u" }],
    }, names)).toBe("When a task moves to Done, if priority is High, then add tag #urgent and assign Sam.");
  });
});
