import { describe, expect, it } from "vitest";
import type { Task } from "@/src/core/sync/types";
import { groupOpen, isMine, movedDue, targetDay } from "@/src/core/review";

const now = new Date(2026, 7, 14, 10); // Friday 14 August 2026
const at = (day: number, hour = 12, minute = 0) => new Date(2026, 7, day, hour, minute).toISOString();
const task = (id: string, extra: Partial<Task>) => ({ id, dueAt: null, dueHasTime: false, assigneeIds: [], createdById: "me", ...extra }) as Task;

describe("movedDue", () => {
  it("moves to tomorrow or next Monday, keeping a due time, or clears it", () => {
    expect(targetDay("tomorrow", now)).toEqual(new Date(2026, 7, 15));
    expect(targetDay("next-week", now)).toEqual(new Date(2026, 7, 17));
    expect(targetDay("next-week", new Date(2026, 7, 17, 9))).toEqual(new Date(2026, 7, 24));

    const timed = movedDue({ dueAt: at(12, 15, 30), dueHasTime: true }, "tomorrow", now);
    expect(timed).toEqual({ dueAt: at(15, 15, 30), dueHasTime: true });
    expect(movedDue({ dueAt: at(12), dueHasTime: false }, "next-week", now)).toEqual({ dueAt: at(17), dueHasTime: false });
    expect(movedDue({ dueAt: null, dueHasTime: false }, "tomorrow", now)).toEqual({ dueAt: at(15), dueHasTime: false });
    expect(movedDue({ dueAt: at(12), dueHasTime: false }, "none", now)).toEqual({ dueAt: null, dueHasTime: false });
  });
});

describe("isMine", () => {
  it("is assigned to me, or unassigned and mine", () => {
    expect(isMine({ assigneeIds: ["me"], createdById: "sam" }, "me")).toBe(true);
    expect(isMine({ assigneeIds: [], createdById: "me" }, "me")).toBe(true);
    expect(isMine({ assigneeIds: ["sam"], createdById: "me" }, "me")).toBe(false);
  });
});

describe("groupOpen", () => {
  it("sorts open tasks into overdue, today, tomorrow, next week and undated", () => {
    const groups = groupOpen([
      task("late", { dueAt: at(12) }),
      task("missed-this-morning", { dueAt: at(14, 8), dueHasTime: true }),
      task("today", { dueAt: at(14) }),
      task("tomorrow", { dueAt: at(15) }),
      task("tuesday", { dueAt: at(18) }),
      task("someday", {}),
    ], now);
    const ids = (list: Task[]) => list.map((t) => t.id);
    expect(ids(groups.overdue)).toEqual(["late", "missed-this-morning"]);
    expect(ids(groups.today)).toEqual(["today"]);
    expect(ids(groups.tomorrow)).toEqual(["tomorrow"]);
    expect(ids(groups.nextWeek)).toEqual(["tuesday"]);
    expect(ids(groups.undated)).toEqual(["someday"]);
  });
});
