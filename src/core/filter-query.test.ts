import { describe, expect, it } from "vitest";
import type { Task } from "@/src/core/sync/types";
import { compileFilter } from "@/src/core/filter-query";

// Friday 14 August 2026, 10:00 local time.
const now = new Date(2026, 7, 14, 10, 0);
const ctx = {
  now,
  meId: "me",
  projects: [{ id: "work", name: "Work" }, { id: "home", name: "Home Office" }],
  members: [{ userId: "sam", displayName: "Sam Lee" }],
  tags: [{ id: "t-bills", name: "bills" }],
};

const task = (id: string, extra: Partial<Task> = {}) => ({
  id, title: id, projectId: "work", dueAt: null, dueHasTime: false, deadlineAt: null,
  priority: "none", assigneeIds: [], tagIds: [], recurrence: null, ...extra,
}) as Task;
const at = (day: number, hour = 12) => new Date(2026, 7, day, hour).toISOString();

const tasks = [
  task("today-work-p1", { dueAt: at(14), priority: "high", assigneeIds: ["me"] }),
  task("today-home", { dueAt: at(14), projectId: "home", assigneeIds: ["sam"] }),
  task("late-timed", { dueAt: at(14, 8), dueHasTime: true, projectId: null }),
  task("yesterday", { dueAt: at(13), recurrence: { frequency: "daily", interval: 1 } }),
  task("tomorrow-p2", { dueAt: at(15), priority: "medium", deadlineAt: at(16) }),
  task("next-week", { dueAt: at(20) }),
  task("undated", { title: "Fix the leak!", tagIds: ["t-bills"] }),
];

function run(query: string) {
  const result = compileFilter(query, ctx);
  if (!result.ok) throw new Error(result.error);
  return tasks.filter(result.test).map((t) => t.id);
}

describe("compileFilter", () => {
  it("matches dates in the viewer's days", () => {
    expect(run("today")).toEqual(["today-work-p1", "today-home", "late-timed"]);
    expect(run("overdue")).toEqual(["late-timed", "yesterday"]);
    expect(run("tomorrow")).toEqual(["tomorrow-p2"]);
    expect(run("next 7 days")).toEqual(["today-work-p1", "today-home", "late-timed", "tomorrow-p2", "next-week"]);
    expect(run("no date")).toEqual(["undated"]);
  });

  it("combines with &, | and !, & binding tighter", () => {
    expect(run("today & #Work & p1")).toEqual(["today-work-p1"]);
    expect(run("overdue | tomorrow & p2")).toEqual(["late-timed", "yesterday", "tomorrow-p2"]);
    expect(run("(overdue | tomorrow) & p2")).toEqual(["tomorrow-p2"]);
    expect(run("today & !#inbox")).toEqual(["today-work-p1", "today-home"]);
  });

  it("knows projects, people, repeats, deadlines and search", () => {
    expect(run("#home office")).toEqual(["today-home"]);
    expect(run("#Inbox")).toEqual(["late-timed"]);
    expect(run("assigned to: me")).toEqual(["today-work-p1"]);
    expect(run("assigned to: Sam Lee")).toEqual(["today-home"]);
    expect(run("assigned to: others")).toEqual(["today-home"]);
    expect(run("no assignee & recurring")).toEqual(["yesterday"]);
    expect(run("deadline")).toEqual(["tomorrow-p2"]);
    expect(run("search: leak!")).toEqual(["undated"]);
    expect(run("@Bills")).toEqual(["undated"]);
    expect(run("!@bills & no date")).toEqual([]);
  });

  it("explains what's wrong", () => {
    const error = (q: string) => { const r = compileFilter(q, ctx); return r.ok ? null : r.error; };
    expect(error("")).toMatch(/Type a query/);
    expect(error("today &")).toBe("The query ends too early");
    expect(error("(today | p1")).toBe("Missing )");
    expect(error("#Nope")).toBe("No project called “Nope”");
    expect(error("@urgent")).toBe("No tag called “urgent”");
    expect(error("someday")).toBe("Unknown term “someday”");
    expect(error("today )")).toBe("Unexpected “)”");
  });
});
