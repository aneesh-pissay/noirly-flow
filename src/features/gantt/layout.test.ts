import { describe, expect, it } from "vitest";
import type { Task } from "@/src/core/sync/types";
import { dayNumber, ganttBars, ganttLinks, ganttPatch, ganttRange, shiftIso } from "@/src/features/gantt/layout";

const noon = (day: number) => new Date(2026, 7, day, 12).toISOString();
const task = (id: string, extra: Partial<Task>) =>
  ({ id, title: id, startAt: null, dueAt: null, dueHasTime: false, deadlineAt: null, blockedByIds: [], ...extra }) as Task;
const d = (day: number) => dayNumber(new Date(2026, 7, day));

describe("ganttBars", () => {
  it("runs from start to due, uses either date alone as one day, and skips undated tasks", () => {
    const bars = ganttBars([
      task("span", { startAt: noon(10), dueAt: noon(14) }),
      task("due-only", { dueAt: noon(12) }),
      task("start-only", { startAt: noon(9) }),
      task("undated", {}),
    ]);
    expect(bars.map((b) => [b.task.id, b.start - d(9), b.end - d(9)])).toEqual([
      ["start-only", 0, 0], ["span", 1, 5], ["due-only", 3, 3],
    ]);
  });
});

describe("ganttRange", () => {
  it("covers the bars and today with padding, at least four weeks", () => {
    const bars = ganttBars([task("a", { startAt: noon(10), dueAt: noon(14) })]);
    expect(ganttRange(bars, d(12))).toEqual({ first: d(7), days: 28 });
  });
});

describe("ganttLinks", () => {
  it("links a blocker's row to the row waiting on it", () => {
    const bars = ganttBars([task("build", { dueAt: noon(14), blockedByIds: ["design", "gone"] }), task("design", { dueAt: noon(11) })]);
    expect(ganttLinks(bars)).toEqual([{ from: 0, to: 1 }]);
  });
});

describe("ganttPatch", () => {
  const bar = ganttBars([task("t", { startAt: noon(10), dueAt: new Date(2026, 7, 14, 15, 30).toISOString(), dueHasTime: true })])[0]!;

  it("moves both dates, keeping the due time", () => {
    const patch = ganttPatch(bar, "move", 3);
    expect(new Date(patch.startAt!).getDate()).toBe(13);
    const due = new Date(patch.dueAt!);
    expect([due.getDate(), due.getHours(), due.getMinutes()]).toEqual([17, 15, 30]);
    expect(patch.dueHasTime).toBe(true);
  });

  it("changes one end, never past the other", () => {
    expect(new Date(ganttPatch(bar, "start", 2).startAt!).getDate()).toBe(12);
    expect(new Date(ganttPatch(bar, "start", 9).startAt!).getDate()).toBe(14);
    expect(new Date(ganttPatch(bar, "end", -10).dueAt!).getDate()).toBe(10);
    expect(new Date(ganttPatch(bar, "end", 1).dueAt!).getHours()).toBe(15);
  });

  it("gives a start-only task a due date when its end is dragged", () => {
    const only = ganttBars([task("s", { startAt: noon(10) })])[0]!;
    expect(ganttPatch(only, "end", 2)).toEqual({ dueAt: noon(12), dueHasTime: false });
  });

  it("shifts across a month end", () => {
    expect(new Date(shiftIso(noon(30), 3)).getMonth()).toBe(8);
  });
});
