import { describe, expect, it } from "vitest";
import type { Task } from "@/src/core/sync/types";
import { allDayTasks, layoutDay, visibleDays, visibleRange } from "@/src/features/timeline/layout";

const day = new Date(2026, 7, 14); // Friday 14 August 2026
const at = (hour: number, minute = 0, date = 14) => new Date(2026, 7, date, hour, minute).toISOString();
const task = (id: string, extra: Partial<Task>) => ({ id, title: id, dueHasTime: true, durationMinutes: null, ...extra }) as Task;
const shape = (blocks: ReturnType<typeof layoutDay>) => blocks.map((b) => [b.task.id, b.start, b.end, b.lane, b.lanes]);

describe("visibleDays", () => {
  it("is the day itself, or Monday to Sunday around it", () => {
    expect(visibleDays("day", new Date(2026, 7, 14, 15))).toEqual([day]);
    const week = visibleDays("week", day);
    expect(week[0]).toEqual(new Date(2026, 7, 10));
    expect(week[6]).toEqual(new Date(2026, 7, 16));
    expect(visibleDays("week", new Date(2026, 7, 16))[0]).toEqual(new Date(2026, 7, 10));
  });

  it("covers whole local days in the query range", () => {
    expect(visibleRange([day])).toEqual({
      dueAfter: day.toISOString(),
      dueBefore: new Date(2026, 7, 14, 23, 59, 59, 999).toISOString(),
    });
  });
});

describe("layoutDay", () => {
  it("places a block from its time for its duration, 30 minutes by default", () => {
    expect(shape(layoutDay([task("a", { dueAt: at(9), durationMinutes: 90 }), task("b", { dueAt: at(14, 15) })], day)))
      .toEqual([["a", 540, 630, 0, 1], ["b", 855, 885, 0, 1]]);
  });

  it("puts overlapping blocks side by side, reusing a lane once it's free", () => {
    const blocks = layoutDay([
      task("long", { dueAt: at(9), durationMinutes: 120 }),
      task("early", { dueAt: at(9, 30) }),
      task("later", { dueAt: at(10, 30) }),
      task("alone", { dueAt: at(15) }),
    ], day);
    expect(shape(blocks)).toEqual([
      ["long", 540, 660, 0, 2],
      ["early", 570, 600, 1, 2],
      ["later", 630, 660, 1, 2],
      ["alone", 900, 930, 0, 1],
    ]);
  });

  it("clips at midnight and leaves out other days and all-day tasks", () => {
    expect(shape(layoutDay([
      task("late", { dueAt: at(23, 30), durationMinutes: 120 }),
      task("tomorrow", { dueAt: at(9, 0, 15) }),
      task("allday", { dueAt: at(12), dueHasTime: false }),
    ], day))).toEqual([["late", 1410, 1440, 0, 1]]);
    expect(allDayTasks([task("allday", { dueAt: at(12), dueHasTime: false })], day).map((t) => t.id)).toEqual(["allday"]);
  });
});
